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

type SimpleZodObject<O extends object, I extends object, InnerType> = z.core.$ZodType<O, I> & SimpleZodMeta & {
  type: 'object'
  def: {
    type: 'object'
    shape: Record<keyof O, InnerType>
  }
}

type SimpleZodString = z.core.$ZodType<string> & {
  type: 'string'
  def: {
    type: 'string'
  }
}

type SimpleZodParameter<O extends object, I extends object> = SimpleZodObject<O, I, SimpleZodString>

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
      data?: SimpleZodObject<object, object, unknown>
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

type EndpointZodSchemaParams<OParams, IParams> = OParams extends object ? IParams extends object ? { params: SimpleZodParameter<OParams, IParams> } : { params?: never } : { params?: never }
type EndpointZodSchemaQuery<OQuery, IQuery> = OQuery extends object ? IQuery extends object ? { query: SimpleZodParameter<OQuery, IQuery> } : { query?: never } : { query?: never }
type EndpointZodSchemaBody<OBody, IBody> = OBody extends object ? IBody extends object ? { body: SimpleZodObject<OBody, IBody, unknown> } : { body?: never } : { body?: never }

type EndpointBodyType<OBodyType> = OBodyType extends string ? { bodyType: OBodyType } : { bodyType?: never }

type EndpointZodSchema<OParams, IParams, OQuery, IQuery, OBody, IBody, OBodyType> = {
  input: EndpointZodSchemaParams<OParams, IParams> & EndpointZodSchemaQuery<OQuery, IQuery> & EndpointZodSchemaBody<OBody, IBody> & EndpointBodyType<OBodyType>
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

      registry.clear()

      return jsonSchema
    },
  }
}

export function defineSchemaMetaProvider<OParams, IParams, OQuery, IQuery, OBody, IBody, OBodyType>(schema: EndpointZodSchema<OParams, IParams, OQuery, IQuery, OBody, IBody, OBodyType>): RouteMeta {
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
        required: typedValue._zod.optin !== 'optional',
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
