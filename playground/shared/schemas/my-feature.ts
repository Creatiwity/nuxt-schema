import z from 'zod/v4'

export const myFeatureParams = z.object({
  userId: z.string(),
})

export const myFeatureQuery = z.object({
  limit: z.coerce.number().optional(),
})

export const myFeatureResponse = z.object({
  status: z.literal(200),
  data: z.object({
    userId: z.string(),
    items: z.array(z.string()),
    limit: z.number(),
  }),
})
