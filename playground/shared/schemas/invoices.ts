import z from 'zod/v4'

export const invoicesParams = z.object({
  id: z.string(),
})

export const invoicesQuery = z.object({
  page: z.coerce.number<string>().int().min(1).optional().default(1),
  query: z.string().optional(),
})

export const invoicesResponse = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal(200),
    data: z.strictObject({
      invoices: z.array(z.string()),
    }),
  }).meta({ description: 'List of invoices' }),
  z.strictObject({
    status: z.literal(404),
    data: z.strictObject({ error: z.string() }),
  }),
])

export const invoiceDeleteParams = z.object({
  id: z.string(),
  invoiceId: z.string(),
})

// Success variant carries no `data` — the 204 No Content shape.
export const invoiceDeleteResponse = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal(204),
  }).meta({ description: 'Invoice deleted' }),
  z.strictObject({
    status: z.literal(404),
    data: z.strictObject({ error: z.string() }),
  }),
])
