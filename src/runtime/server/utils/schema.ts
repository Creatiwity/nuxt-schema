import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Components, Operation, Schema } from 'oas-types/3.1'
import { createError, defineEventHandler, getValidatedQuery, getValidatedRouterParams, readValidatedBody, setResponseStatus, type EventHandlerRequest, type H3Event } from 'h3'

type EndpointSchemaParams<OParams> = OParams extends object ? { params: StandardSchemaV1<OParams> } : { params?: never }
type EndpointSchemaQuery<OQuery> = OQuery extends object ? { query: StandardSchemaV1<OQuery> } : { query?: never }
type EndpointSchemaBody<OBody> = OBody extends object ? { body: StandardSchemaV1<OBody> } : { body?: never }

type EndpointSchema<OParams, OQuery, OBody, Status extends number, OOutput extends { status: Status, data: unknown }> = {
  input: EndpointSchemaParams<OParams> & EndpointSchemaQuery<OQuery> & EndpointSchemaBody<OBody>
  output: StandardSchemaV1<OOutput>
}

type EndpointParams<OParams> = OParams extends object ? { params: OParams } : { params?: never }
type EndpointQuery<OQuery> = OQuery extends object ? { query: OQuery } : { query?: never }
type EndpointBody<OBody> = OBody extends object ? { body: OBody } : { body?: never }

type EndpointInput<OParams, OQuery, OBody> = EndpointParams<OParams> & EndpointQuery<OQuery> & EndpointBody<OBody>

type EndpointOutput<Status extends number, OOutput extends { status: Status, data: unknown }> = OOutput

export function defineSchemaEventHandler<OParams extends object | undefined, OQuery extends object | undefined, OBody extends object | undefined, Status extends number, OOutput extends { status: Status, data: unknown }, Request extends EventHandlerRequest = EventHandlerRequest>(schema: EndpointSchema<OParams, OQuery, OBody, Status, OOutput>, _toJSONSchema: () => Record<string, Schema>, handler: (input: EndpointInput<OParams, OQuery, OBody>, event: H3Event<Request>) => EndpointOutput<Status, OOutput>) {
  return defineEventHandler(async (event) => {
    const { params: schemaParams, query: schemaQuery, body: schemaBody } = schema.input

    const validatedInput: Partial<EndpointInput<OParams, OQuery, OBody>> = {}

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
      }) as EndpointInput<OParams, OQuery, OBody>['params']
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
      }) as EndpointInput<OParams, OQuery, OBody>['query']
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
      }) as EndpointInput<OParams, OQuery, OBody>['body']
    }

    let output
    try {
      output = handler(validatedInput as EndpointInput<OParams, OQuery, OBody>, event)
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

    return output.data
  })
}

interface Extensable {
  [key: `x-${string}`]: unknown
}

interface RouteMeta {
  openAPI?: Operation & {
    $global?: {
      components: Components & Extensable
    }
  }
}

export function defineSchemaMetaProvider<OParams extends object | undefined, OQuery extends object | undefined, OBody extends object | undefined, Status extends number, OOutput extends { status: Status, data: unknown }>(schema: EndpointSchema<OParams, OQuery, OBody, Status, OOutput>, toJSONSchema: () => Record<string, Schema>): RouteMeta {
  return {
    openAPI: {
      security: [{ cookieAccessToken: [] }],
      responses: {
        200: {
          description: 'List of available universes',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/universes',
              },
            },
          },
        },
        500: {
          description: 'Error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/error',
              },
            },
          },
        },
      },
      $global: {
        components: {
          schemas: toJSONSchema(),
        },
      },
    },
  }
}
