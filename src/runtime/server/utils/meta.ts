import type { Components, Operation, Schema } from 'oas-types/3.1'
import type { EndpointSchema } from './types'

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

export function defineSchemaMetaProvider<OParams extends object | undefined, OQuery extends object | undefined, OBody extends object | undefined, Status extends number, OOutput extends { status: Status, data: unknown }>(schema: EndpointSchema<OParams, OQuery, OBody, Status, OOutput>): RouteMeta {
  return {
    openAPI: {
      security: [{ cookieAccessToken: [] }],
      responses: {
        200: {
          description: 'List of available modes',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/modes',
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
