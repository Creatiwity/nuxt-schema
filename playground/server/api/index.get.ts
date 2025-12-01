import z from 'zod/v4'

const toJSONSchema = () => z.toJSONSchema(z.globalRegistry, { uri: id => `#/components/schemas/${id}` })

const mode = z.enum(['HOME', 'WORK']).meta({
  id: 'mode',
  title: 'Mode',
  description: 'Mode identifier',
  examples: [
    'HOME',
    'WORK',
  ],
})

const modes = z.object({
  modes: z.array(mode),
}).meta({
  id: 'modes',
  title: 'Modes',
  description: 'List of available modes',
  examples: [
    {
      universes: ['HOME', 'WORK'],
    },
  ],
})

const response = z.discriminatedUnion('status', [
  z.object({ status: z.literal(200), data: mode }),
  z.object({ status: z.literal(500), data: z.string() }),
])

export default defineSchemaEventHandler({
  input: {
    body: modes,
  },
  output: response,
}, toJSONSchema, ({ body }) => {
  const mode = body.modes.at(0)

  return {
    status: 200,
    data: mode ?? 'HOME' as const,
  }
})
