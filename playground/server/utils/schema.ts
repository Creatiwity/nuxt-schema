import z from 'zod/v4'
import { mode } from '#shared/schemas/Mode'

export const query = z.object({
  modes: z.union([mode, z.array(mode)]),
}).partial()

export const response = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal(200), data: z.strictObject({ mode }),
  }).meta({ description: 'Mode available' }),
  z.strictObject({ status: z.literal(500), data: z.strictObject({ error: z.string() }) }),
])
