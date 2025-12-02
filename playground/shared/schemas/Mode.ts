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
