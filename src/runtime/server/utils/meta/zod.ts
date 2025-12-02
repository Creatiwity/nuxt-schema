import z from 'zod/v4'

export const toJSONSchema = () => z.toJSONSchema(z.globalRegistry)
