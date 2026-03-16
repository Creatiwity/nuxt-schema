import z from 'zod/v4'

export const mode = z.enum(['HOME', 'WORK']).meta({
  id: 'mode',
  title: 'Mode',
  description: 'Mode identifier',
  examples: [
    'HOME',
    'WORK',
  ],
})

export const modes = z.strictObject({
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

export const modeQuery = z.object({
  modes: z.union([mode, z.array(mode)]),
}).partial()

export const modeResponse = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal(200), data: z.strictObject({ mode }),
  }).meta({ description: 'Mode available' }),
  z.strictObject({ status: z.literal(500), data: z.strictObject({ error: z.string() }) }),
])
