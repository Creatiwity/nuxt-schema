import { invoicesParams, invoicesQuery, invoicesResponse } from '#shared/schemas/invoices'

export default defineSchemaHandler({
  description: 'Get paginated invoices for a structure',
  input: {
    params: invoicesParams,
    query: invoicesQuery,
  },
  output: invoicesResponse,
}, ({ params, query }) => {
  return {
    status: 200 as const,
    data: {
      invoices: [`invoice-${params.id}-page${query.page}${query.query ? `-${query.query}` : ''}`],
    },
  }
})
