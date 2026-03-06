declare module '#mcp-auth' {
  type McpAuthHandler = import('../utils/mcp-auth').McpAuthHandler
  const handler: McpAuthHandler | undefined
  export default handler
}
