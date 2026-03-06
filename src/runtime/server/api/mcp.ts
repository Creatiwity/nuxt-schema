import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import { getObjectShape } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { defineEventHandler, getHeader, getRequestURL, setResponseStatus, setResponseHeaders, readRawBody } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { mcpTools } from '#schema-mcp'
import { validateJwt, lookupAccessToken } from '../utils/mcp-oauth'

function createMcpServer(name: string, version: string): McpServer {
  const server = new McpServer({ name, version })

  for (const tool of mcpTools) {
    const paramsShape = getObjectShape(tool.paramsSchema) ?? {}
    const queryShape = getObjectShape(tool.querySchema) ?? {}
    const bodyShape = getObjectShape(tool.bodySchema) ?? {}
    const queryKeys = new Set(Object.keys(queryShape))
    const bodyKeys = new Set(Object.keys(bodyShape))
    const inputSchema = { ...paramsShape, ...queryShape, ...bodyShape } as ZodRawShapeCompat

    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema,
      },
      async (input) => {
        const args = input as Record<string, unknown>
        const url = tool.pathTemplate.replace(/\{(\w+)\}/g, (_, k: string) => String(args[k] ?? ''))
        const query = Object.fromEntries([...queryKeys].filter(k => k in args).map(k => [k, args[k]]))
        const body = Object.fromEntries([...bodyKeys].filter(k => k in args).map(k => [k, args[k]]))

        try {
          const result = await $fetch(url, {
            method: tool.method as NonNullable<Parameters<typeof $fetch>[1]>['method'],
            ...(queryKeys.size ? { query } : {}),
            ...(bodyKeys.size ? { body } : {}),
          })
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
        }
        catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
        }
      },
    )
  }

  return server
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  // Auth guard
  const authType = config.mcpAuthType as string | undefined
  const authHeader = getHeader(event, 'authorization') ?? ''
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '')

  if (authType === 'bearer') {
    const authToken = config.mcpAuthToken as string | undefined
    if (authToken && authHeader !== `Bearer ${authToken}`) {
      setResponseStatus(event, 401)
      setResponseHeaders(event, { 'WWW-Authenticate': 'Bearer' })
      return { error: 'Unauthorized' }
    }
  }
  else if (authType === 'jwt') {
    const issuer = config.mcpAuthIssuer as string
    if (!bearerToken || !await validateJwt(bearerToken, issuer)) {
      const origin = getRequestURL(event).origin
      setResponseStatus(event, 401)
      setResponseHeaders(event, {
        'WWW-Authenticate': `Bearer realm="${origin}", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      })
      return { error: 'Unauthorized' }
    }
  }
  else if (authType === 'oauth') {
    if (!bearerToken || !await lookupAccessToken(bearerToken)) {
      const origin = getRequestURL(event).origin
      const mcpPath = config.public.mcpPath as string
      setResponseStatus(event, 401)
      setResponseHeaders(event, {
        'WWW-Authenticate': `Bearer realm="${origin}${mcpPath}", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      })
      return { error: 'Unauthorized' }
    }
  }

  const mcpServer = createMcpServer(
    (config.mcpName as string | undefined) ?? 'nuxt-schema-mcp',
    (config.mcpVersion as string | undefined) ?? '1.0.0',
  )
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  await mcpServer.connect(transport)

  const rawBody = await readRawBody(event)
  const parsedBody = rawBody ? JSON.parse(rawBody) : undefined

  await transport.handleRequest(event.node.req, event.node.res, parsedBody)
})
