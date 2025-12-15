import type { Components, MediaType, Operation, Parameter, RequestBody, ResponsesMap } from 'oas-types/3.1'
import z from 'zod/v4'

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

type SimpleZodMeta = {
  meta: () => {
    id?: string
    title?: string
    description?: string
  } | undefined
}

type SimpleZodObject<T extends object, InnerType> = z.core.$ZodType<T> & SimpleZodMeta & {
  type: 'object'
  def: {
    type: 'object'
    shape: Record<keyof T, InnerType>
  }
}

type SimpleZodString = z.core.$ZodType<string> & {
  type: 'string'
  def: {
    type: 'string'
  }
}

type SimpleZodParameter<T extends object> = SimpleZodObject<T, SimpleZodString>

type SimpleZodLiteral<T extends string | number> = z.core.$ZodType<T> & {
  type: 'literal'
  def: {
    type: 'literal'
    values: [T]
  }
}

type SimpleOutputZodObject = SimpleZodMeta & {
  type: 'object'
  def: {
    type: 'object'
    shape: {
      status: SimpleZodLiteral<number>
      data?: SimpleZodObject<object, unknown>
      type?: SimpleZodLiteral<string>
    }
  }
}

type SimpleZodUnion<T> = z.core.$ZodType<T> & {
  type: 'union'
  def: {
    type: 'union'
    options: T[]
  }
}

type OutputZodObject = SimpleOutputZodObject | SimpleZodUnion<SimpleOutputZodObject>

type EndpointZodSchemaParams<OParams> = OParams extends object ? { params: SimpleZodParameter<OParams> } : { params?: never }
type EndpointZodSchemaQuery<OQuery> = OQuery extends object ? { query: SimpleZodParameter<OQuery> } : { query?: never }
type EndpointZodSchemaBody<OBody> = OBody extends object ? { body: SimpleZodObject<OBody, unknown> } : { body?: never }

type EndpointBodyType<OBodyType> = OBodyType extends string ? { bodyType: OBodyType } : { bodyType?: never }

type EndpointZodSchema<OParams, OQuery, OBody, OBodyType> = {
  input: EndpointZodSchemaParams<OParams> & EndpointZodSchemaQuery<OQuery> & EndpointZodSchemaBody<OBody> & EndpointBodyType<OBodyType>
  output: OutputZodObject
}

function useIdGenerator() {
  const seed = Math.abs(Math.random() * 10000)
  let index = -1
  const prefix = 'id'

  return () => {
    index += 1
    return [prefix, seed, index].join('-')
  }
}

function useRegistry() {
  const generateId = useIdGenerator()
  const registry = z.globalRegistry
  const schemasToTransfer: Record<string, Partial<z.core.JSONSchema.BaseSchema>> = {}

  return {
    addSchema: (value: z.core.$ZodType & SimpleZodMeta) => {
      const meta = value.meta()
      if (meta?.id != null) {
        if (!registry.has(value)) {
          registry.add(value, { id: meta.id })
        }

        return {
          $ref: `#/components/schemas/${meta.id}`,
        }
      }
      else {
        const schema: Partial<z.core.JSONSchema.BaseSchema> = {}
        const id = generateId()
        schemasToTransfer[id] = schema
        registry.add(value as z.core.$ZodType, { id })

        return schema
      }
    },
    toJSONSchema: () => {
      const jsonSchema = z.toJSONSchema(registry, {
        uri: id => `#/components/schemas/${id}`,
      })

      Object.entries(schemasToTransfer).forEach(([id, target]) => {
        const schema = jsonSchema.schemas[id]
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete jsonSchema.schemas[id]

        if (schema != null) {
          schema.id = undefined
          schema.$id = undefined
          schema.$schema = undefined
          Object.assign(target, schema)
        }
      })

      return jsonSchema
    },
  }
}

export function defineSchemaMetaProvider<OParams, OQuery, OBody, OBodyType>(schema: EndpointZodSchema<OParams, OQuery, OBody, OBodyType>): RouteMeta {
  const { addSchema, toJSONSchema } = useRegistry()

  const parameters: Parameter[] = []

  if (schema.input.params != null) {
    parameters.splice(-1, 0, ...Object.entries(schema.input.params.def.shape).map(([key, value]) => (
      {
        name: key,
        in: 'path' as const,
        required: true,
        schema: addSchema(value as z.core.$ZodType & SimpleZodMeta),
      }
    )))
  }

  if (schema.input.query != null) {
    parameters.splice(-1, 0, ...Object.entries(schema.input.query.def.shape).map(([key, value]) => {
      const typedValue = value as (z.core.$ZodObjectDef | z.core.$ZodOptionalDef) & z.core.$ZodType & SimpleZodMeta

      return {
        name: key,
        in: 'query' as const,
        required: typedValue.type !== 'optional',
        schema: addSchema(typedValue),
      }
    }))
  }

  let requestBody: RequestBody | undefined

  if (schema.input.body != null) {
    requestBody = {
      required: true,
      content: {
        [schema.input.bodyType ?? 'application/json']: {
          schema: addSchema(schema.input.body),
        },
      },
    }
  }

  const responses: ResponsesMap = {}

  if (schema.output != null) {
    let outputs: SimpleOutputZodObject[] = []

    if (schema.output.type === 'object') {
      outputs = [schema.output]
    }
    else {
      outputs = schema.output.def.options
    }

    outputs.forEach((out) => {
      const status = `${out.def.shape.status.def.values[0]}` as keyof ResponsesMap

      const meta = out.meta()
      const content: Record<string, MediaType> = {}

      if (out.def.shape.data != null) {
        content[out.def.shape.type?.def.values[0] ?? 'application/json'] = {
          schema: addSchema(out.def.shape.data),
        }
      }

      responses[status] = {
        description: meta?.description ?? 'None',
        content,
      }
    })
  }

  return {
    openAPI: {
      security: [{ cookieAccessToken: [] }],
      parameters,
      requestBody,
      responses,
      $global: {
        components: toJSONSchema(),
      },
    },
  }
}
