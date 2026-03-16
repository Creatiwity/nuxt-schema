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
