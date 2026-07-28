import { invoiceDeleteParams, invoiceDeleteResponse } from '#shared/schemas/invoices'

export default defineSchemaHandler({
  description: 'Delete an invoice of a structure',
  input: {
    params: invoiceDeleteParams,
  },
  output: invoiceDeleteResponse,
}, ({ params }) => {
  if (params.invoiceId === 'missing') {
    return {
      status: 404 as const,
      data: { error: 'Invoice not found' },
    }
  }

  return {
    status: 204 as const,
  }
})
