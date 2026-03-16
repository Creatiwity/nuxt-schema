import type { StandardSchemaV1 } from '@standard-schema/spec'

type EndpointSchemaParams<IParams, OParams> = OParams extends object ? { params: StandardSchemaV1<IParams, OParams> } : { params?: never }
type EndpointSchemaQuery<IQuery, OQuery> = OQuery extends object ? { query: StandardSchemaV1<IQuery, OQuery> } : { query?: never }
type EndpointSchemaBody<IBody, OBody> = OBody extends object ? { body: StandardSchemaV1<IBody, OBody> } : { body?: never }

type EndpointBodyType<OBodyType> = OBodyType extends string ? { bodyType: OBodyType } : { bodyType?: never }

export type EndpointSchema<IParams, OParams, IQuery, OQuery, IBody, OBody, OBodyType, Status extends number, OOutput extends { status: Status, data?: unknown }> = {
  description?: string
  mcp?: boolean
  mcpName?: string
  input: EndpointSchemaParams<IParams, OParams> & EndpointSchemaQuery<IQuery, OQuery> & EndpointSchemaBody<IBody, OBody> & EndpointBodyType<OBodyType>
  output: StandardSchemaV1<OOutput>
}

type EndpointParams<OParams> = OParams extends object ? { params: OParams } : { params?: never }
type EndpointQuery<OQuery> = OQuery extends object ? { query: OQuery } : { query?: never }
type EndpointBody<OBody> = OBody extends object ? { body: OBody } : { body?: never }

export type EndpointInput<OParams, OQuery, OBody, OBodyType> = EndpointParams<OParams> & EndpointQuery<OQuery> & EndpointBody<OBody> & EndpointBodyType<OBodyType>

export type EndpointOutput<Status extends number, OOutput extends { status: Status, data?: unknown, type?: string }> = OOutput
