import { defineEventHandler, getQuery, sendRedirect, createError, sendError } from 'h3'
import { consumeAuthSession, storeAuthCode, generateCode } from '../utils/mcp-oauth'
import authHandler from '#mcp-auth'

export default defineEventHandler(async (event) => {
  if (!authHandler) {
    return sendError(event, createError({ statusCode: 501, statusMessage: 'No MCP auth handler configured.' }))
  }

  const { code, state, error } = getQuery(event)

  if (error || typeof state !== 'string') {
    return sendError(event, createError({ statusCode: 400, statusMessage: String(error ?? 'Missing state') }))
  }

  const session = await consumeAuthSession(state)
  if (!session) {
    return sendError(event, createError({ statusCode: 400, statusMessage: 'Invalid or expired session' }))
  }

  const claims = await authHandler.exchangeCode(event, String(code))
  const authCode = generateCode()
  await storeAuthCode(authCode, { codeChallenge: session.codeChallenge, claims })

  const redirect = new URL(session.mcpRedirectUri)
  redirect.searchParams.set('code', authCode)
  if (session.mcpState) redirect.searchParams.set('state', session.mcpState)

  return sendRedirect(event, redirect.toString())
})
