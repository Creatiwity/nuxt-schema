import type { H3Event } from 'h3'

/**
 * Interface for a custom MCP OAuth proxy handler.
 *
 * Implement this to integrate MCP auth with an existing OAuth provider.
 * Register it by creating `server/mcp-auth.ts` in your Nuxt project.
 *
 * @example
 * // server/mcp-auth.ts
 * export default defineMcpAuthHandler({
 *   getAuthorizationUrl(callbackUrl, state) {
 *     return `https://my-provider.com/login?redirect_uri=${callbackUrl}&state=${state}`
 *   },
 *   async exchangeCode(event, code) {
 *     const user = await fetchUserFromCode(code)
 *     return { sub: user.id, email: user.email }
 *   },
 * })
 */
export interface McpAuthHandler {
  /**
   * Build the redirect URL for the external authorization server.
   * @param callbackUrl - Our callback URL (`/_mcp/callback`) that the provider should redirect to
   * @param state - Opaque state value linking the callback to the pending session
   */
  getAuthorizationUrl(callbackUrl: string, state: string): string | Promise<string>

  /**
   * Exchange the external provider's authorization code for user claims.
   * @param event - The H3 event (callback request from the external provider)
   * @param code - The authorization code received from the external provider
   * @returns A claims object; `sub` (subject identifier) is recommended
   */
  exchangeCode(event: H3Event, code: string): Promise<Record<string, unknown>>
}

/**
 * Define a custom MCP OAuth proxy handler.
 *
 * Create this as the default export in `server/mcp-auth.ts` to enable `auth.type: 'oauth'`.
 */
export function defineMcpAuthHandler(handler: McpAuthHandler): McpAuthHandler {
  return handler
}
