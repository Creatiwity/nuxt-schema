import z from 'zod/v4'

const mode = z.enum(['HOME', 'WORK']).meta({
  id: 'mode',
  title: 'Mode',
  description: 'Mode identifier',
  examples: [
    'HOME',
    'WORK',
  ],
})

const modes = z.strictObject({
  modes: z.array(mode),
}).meta({
  id: 'modes',
  title: 'Modes',
  description: 'List of available modes',
  examples: [
    {
      modes: ['HOME', 'WORK'],
    },
  ],
})

const response = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal(200), data: z.strictObject({ mode }),
  }),
  z.strictObject({ status: z.literal(500), data: z.strictObject({ error: z.string() }) }),
])

export default defineSchemaHandler({
  input: {
    query: modes,
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
