import { defineEventHandler, createError, getValidatedQuery, getValidatedRouterParams, H3Error, readValidatedBody, setResponseHeader, setResponseStatus, type EventHandlerRequest, type H3Event } from 'h3'
import type { EndpointInput, EndpointOutput, EndpointSchema } from './types'
import { isPromise } from 'node:util/types'
import type { StandardSchemaV1 } from '@standard-schema/spec'

export { defineSchemaMetaProvider } from './meta/zod'

type ValidationType = 'params' | 'query' | 'body' | 'output'

type DefineSchemaHandlerOptions = {
  defineHandler?: typeof defineEventHandler
  onValidationError?: (type: ValidationType, failureResult: StandardSchemaV1.FailureResult, event: H3Event<EventHandlerRequest>) => Promise<void> | void
  onH3Error?: (h3Error: H3Error, event: H3Event<EventHandlerRequest>) => Promise<void> | void
  onHandlerError?: (error: unknown, event: H3Event<EventHandlerRequest>) => Promise<void> | void
}

export function defineSchemaHandler<
  OParams,
  OQuery,
  OBody,
  OBodyType,
  Status extends number,
  OOutput extends { status: Status, data?: unknown, type?: string },
  Request extends EventHandlerRequest = EventHandlerRequest,
>(
  schema: EndpointSchema<OParams, OQuery, OBody, OBodyType, Status, OOutput>,
  handler: (input: EndpointInput<OParams, OQuery, OBody, OBodyType>, event: H3Event<Request>) => EndpointOutput<Status, OOutput> | Promise<EndpointOutput<Status, OOutput>>,
  options?: DefineSchemaHandlerOptions,
) {
  const defineHandler = options?.defineHandler ?? defineEventHandler

  return defineHandler(async (event) => {
    const { params: schemaParams, query: schemaQuery, body: schemaBody } = schema.input

    const validatedInput: Partial<EndpointInput<OParams, OQuery, OBody, OBodyType>> = {}

    if (schemaParams != null) {
      validatedInput.params = await getValidatedRouterParams(event, async (data) => {
        const result = await schemaParams['~standard'].validate(data)
        if (result.issues) {
          options?.onValidationError?.('params', result, event)

          throw {
            message: 'Params validation failed',
            issues: result.issues,
          }
        }
        return result.value
      }) as EndpointInput<OParams, OQuery, OBody, OBodyType>['params']
    }

    if (schemaQuery != null) {
      validatedInput.query = await getValidatedQuery(event, async (data) => {
        const result = await schemaQuery['~standard'].validate(data)
        if (result.issues) {
          options?.onValidationError?.('query', result, event)

          throw {
            message: 'Query validation failed',
            issues: result.issues,
          }
        }
        return result.value
      }) as EndpointInput<OParams, OQuery, OBody, OBodyType>['query']
    }

    if (schemaBody != null) {
      validatedInput.body = await readValidatedBody(event, async (data) => {
        const result = await schemaBody['~standard'].validate(data)
        if (result.issues) {
          options?.onValidationError?.('body', result, event)

          throw {
            message: 'Body validation failed',
            issues: result.issues,
          }
        }
        return result.value
      }) as EndpointInput<OParams, OQuery, OBody, OBodyType>['body']
    }

    let output: EndpointOutput<Status, OOutput>
    try {
      const unchecked = handler(validatedInput as EndpointInput<OParams, OQuery, OBody, OBodyType>, event)
      if (isPromise(unchecked)) {
        output = await unchecked
      }
      else {
        output = unchecked
      }
    }
    catch (error) {
      // Allow H3Error with allowed response code
      if (error instanceof H3Error) {
        output = { status: error.statusCode, data: { message: error.message } } as OOutput

        options?.onH3Error?.(error, event)
      }
      else {
        options?.onHandlerError?.(error, event)

        throw createError({
          status: 500,
          statusText: 'Internal Server Error',
          message: 'Unhandled unknown internal error',
          cause: error,
        })
      }
    }

    const result = await schema.output['~standard'].validate(output)
    if (result.issues) {
      options?.onValidationError?.('output', result, event)

      throw createError({
        status: 500,
        statusText: 'Internal Server Error',
        message: 'Internal Server Error',
        cause: result.issues,
      })
    }

    setResponseStatus(event, output.status)

    if (output.type != null) {
      setResponseHeader(event, 'content-type', output.type)
    }

    return output.data
  })
}
