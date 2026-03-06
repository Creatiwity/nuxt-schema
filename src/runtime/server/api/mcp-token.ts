import { defineEventHandler, readBody, createError, sendError } from 'h3'
import { consumeAuthCode, storeAccessToken, generateCode, verifyS256, ACCESS_TOKEN_TTL } from '../utils/mcp-oauth'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, string>>(event)
  const { grant_type, code, code_verifier } = body ?? {}

  if (grant_type !== 'authorization_code' || !code || !code_verifier) {
    return sendError(event, createError({ statusCode: 400, statusMessage: 'Invalid token request' }))
  }

  const entry = await consumeAuthCode(code)
  if (!entry) {
    return sendError(event, createError({ statusCode: 400, statusMessage: 'Invalid or expired authorization code' }))
  }

  if (!await verifyS256(code_verifier, entry.codeChallenge)) {
    return sendError(event, createError({ statusCode: 400, statusMessage: 'Code verifier does not match challenge' }))
  }

  const accessToken = generateCode()
  await storeAccessToken(accessToken, entry.claims)

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL,
  }
})
