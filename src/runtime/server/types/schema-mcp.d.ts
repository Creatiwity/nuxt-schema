declare module '#schema-mcp' {
  type AnySchema = import('@modelcontextprotocol/sdk/server/zod-compat.js').AnySchema

  export const mcpTools: Array<{
    name: string
    description?: string
    method: string
    pathTemplate: string
    paramsSchema: AnySchema | undefined
    querySchema: AnySchema | undefined
    bodySchema: AnySchema | undefined
  }>
}
