import type { StandardSchemaV1 } from '@standard-schema/spec'

type EndpointSchemaParams<OParams> = OParams extends object ? { params: StandardSchemaV1<OParams> } : { params?: never }
type EndpointSchemaQuery<OQuery> = OQuery extends object ? { query: StandardSchemaV1<OQuery> } : { query?: never }
type EndpointSchemaBody<OBody> = OBody extends object ? { body: StandardSchemaV1<OBody> } : { body?: never }

type EndpointBodyType<OBodyType> = OBodyType extends string ? { bodyType: OBodyType } : { bodyType?: never }

export type EndpointSchema<OParams, OQuery, OBody, OBodyType, Status extends number, OOutput extends { status: Status, data?: unknown }> = {
  input: EndpointSchemaParams<OParams> & EndpointSchemaQuery<OQuery> & EndpointSchemaBody<OBody> & EndpointBodyType<OBodyType>
  output: StandardSchemaV1<OOutput>
}

type EndpointParams<OParams> = OParams extends object ? { params: OParams } : { params?: never }
type EndpointQuery<OQuery> = OQuery extends object ? { query: OQuery } : { query?: never }
type EndpointBody<OBody> = OBody extends object ? { body: OBody } : { body?: never }

export type EndpointInput<OParams, OQuery, OBody, OBodyType> = EndpointParams<OParams> & EndpointQuery<OQuery> & EndpointBody<OBody> & EndpointBodyType<OBodyType>

export type EndpointOutput<Status extends number, OOutput extends { status: Status, data?: unknown, type?: string }> = OOutput
