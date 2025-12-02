import { createError, defineEventHandler, getValidatedQuery, getValidatedRouterParams, readValidatedBody, setResponseHeader, setResponseStatus, type EventHandlerRequest, type H3Event } from 'h3'
import type { EndpointInput, EndpointOutput, EndpointSchema } from './types'

export function defineSchemaHandler<
  OParams,
  OQuery,
  OBody,
  OBodyType,
  Status extends number,
  OOutput extends { status: Status, data: unknown, type?: string },
  Request extends EventHandlerRequest = EventHandlerRequest,
>(
  schema: EndpointSchema<OParams, OQuery, OBody, OBodyType, Status, OOutput>,
  handler: (input: EndpointInput<OParams, OQuery, OBody, OBodyType>, event: H3Event<Request>) => EndpointOutput<Status, OOutput>,
  defineHandler: typeof defineEventHandler = defineEventHandler,
) {
  return defineHandler(async (event) => {
    const { params: schemaParams, query: schemaQuery, body: schemaBody } = schema.input

    const validatedInput: Partial<EndpointInput<OParams, OQuery, OBody, OBodyType>> = {}

    if (schemaParams != null) {
      validatedInput.params = await getValidatedRouterParams(event, async (data) => {
        const result = await schemaParams['~standard'].validate(data)
        if (result.issues) {
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
          throw {
            message: 'Body validation failed',
            issues: result.issues,
          }
        }
        return result.value
      }) as EndpointInput<OParams, OQuery, OBody, OBodyType>['body']
    }

    let output
    try {
      output = handler(validatedInput as EndpointInput<OParams, OQuery, OBody, OBodyType>, event)
    }
    catch (error) {
      // TODO: Internal issues
      console.error(error)

      throw createError({
        status: 500,
        statusText: 'Internal Server Error',
        message: 'Unhandled unknown internal error',
      })
    }

    const result = await schema.output['~standard'].validate(output)
    if (result.issues) {
      // TODO: Internal issues
      throw createError({
        status: 500,
        statusText: 'Internal Server Error',
        message: 'Internal Server Error',
        data: result.issues,
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
