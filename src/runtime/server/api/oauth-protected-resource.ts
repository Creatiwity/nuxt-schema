import { defineEventHandler, getRequestURL } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

// RFC 9728 — OAuth 2.0 Protected Resource Metadata
// Tells MCP clients where to find the authorization server for this resource.
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const origin = getRequestURL(event).origin
  const mcpPath = config.public.mcpPath as string

  const authorizationServers = config.mcpAuthType === 'jwt'
    ? [config.mcpAuthIssuer as string]
    : [origin] // oauth mode: we are the authorization server

  return {
    resource: `${origin}${mcpPath}`,
    authorization_servers: authorizationServers,
  }
})
