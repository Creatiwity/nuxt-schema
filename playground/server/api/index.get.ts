import z from 'zod/v4'
import { mode } from '#shared/schemas/Mode'

const query = z.object({
  modes: z.array(mode),
})

const response = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal(200), data: z.strictObject({ mode }),
  }),
  z.strictObject({ status: z.literal(500), data: z.strictObject({ error: z.string() }) }),
])

export default defineSchemaHandler({
  input: {
    query,
  },
  output: response,
}, ({ query }) => {
  const mode = query.modes.at(0)

  return {
    status: 200,
    data: {
      mode: mode ?? 'HOME' as const,
    },
  }
})
