import { defineEventHandler, getQuery, getRequestURL, sendRedirect, createError, sendError } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { storeAuthSession, generateCode } from '../utils/mcp-oauth'
import authHandler from '#mcp-auth'

export default defineEventHandler(async (event) => {
  if (!authHandler) {
    return sendError(event, createError({ statusCode: 501, statusMessage: 'No MCP auth handler configured. Create server/mcp-auth.ts.' }))
  }

  const { response_type, redirect_uri, code_challenge, code_challenge_method, state } = getQuery(event)

  if (
    response_type !== 'code'
    || typeof redirect_uri !== 'string'
    || typeof code_challenge !== 'string'
    || code_challenge_method !== 'S256'
  ) {
    return sendError(event, createError({ statusCode: 400, statusMessage: 'Invalid authorization request' }))
  }

  const sessionState = generateCode()
  await storeAuthSession(sessionState, {
    mcpRedirectUri: redirect_uri,
    codeChallenge: code_challenge,
    mcpState: state ? String(state) : undefined,
  })

  const mcpPath = useRuntimeConfig(event).public.mcpPath as string
  const callbackUrl = `${getRequestURL(event).origin}${mcpPath}/callback`
  const authorizationUrl = await authHandler.getAuthorizationUrl(callbackUrl, sessionState)

  return sendRedirect(event, authorizationUrl)
})
