import { defineEventHandler, getRequestURL } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

// RFC 8414 — OAuth 2.0 Authorization Server Metadata
// Only registered when auth type is 'oauth' (this app acts as the authorization server).
export default defineEventHandler((event) => {
  const origin = getRequestURL(event).origin
  const mcpPath = useRuntimeConfig(event).public.mcpPath as string

  return {
    issuer: origin,
    authorization_endpoint: `${origin}${mcpPath}/authorize`,
    token_endpoint: `${origin}${mcpPath}/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  }
})
