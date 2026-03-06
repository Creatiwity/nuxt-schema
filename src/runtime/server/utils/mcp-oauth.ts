// MCP OAuth utilities backed by Nitro Storage.
//
// In development the default driver is in-memory (no config needed).
// For multi-instance deployments (e.g. Azure Functions), configure a shared
// driver in nuxt.config.ts:
//
//   nitro: {
//     storage: {
//       'mcp-auth': { driver: 'redis', url: process.env.REDIS_URL }
//     }
//   }

import { useStorage } from 'nitropack/runtime'

// ── Crypto ───────────────────────────────────────────────────────────────────

/** Generate a cryptographically random hex string (64 chars). */
export function generateCode(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** Verify a PKCE S256 code_challenge against a code_verifier. */
export async function verifyS256(verifier: string, challenge: string): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const computed = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return computed === challenge
}

// ── Auth session store (authorize → callback) ────────────────────────────────

interface AuthSession {
  mcpRedirectUri: string
  codeChallenge: string
  mcpState?: string
}

const SESSION_TTL = 10 * 60 // seconds

export async function storeAuthSession(state: string, session: AuthSession): Promise<void> {
  await useStorage('mcp-auth').setItem(`session:${state}`, session, { ttl: SESSION_TTL })
}

export async function consumeAuthSession(state: string): Promise<AuthSession | undefined> {
  const s = useStorage('mcp-auth')
  const [session] = await Promise.all([s.getItem<AuthSession>(`session:${state}`), s.removeItem(`session:${state}`)])
  return session ?? undefined
}

// ── Auth code store (callback → token) ───────────────────────────────────────

interface AuthCode {
  codeChallenge: string
  claims: Record<string, unknown>
}

const CODE_TTL = 5 * 60 // seconds

export async function storeAuthCode(code: string, entry: AuthCode): Promise<void> {
  await useStorage('mcp-auth').setItem(`code:${code}`, entry, { ttl: CODE_TTL })
}

export async function consumeAuthCode(code: string): Promise<AuthCode | undefined> {
  const s = useStorage('mcp-auth')
  const [entry] = await Promise.all([s.getItem<AuthCode>(`code:${code}`), s.removeItem(`code:${code}`)])
  return entry ?? undefined
}

// ── Access token store ────────────────────────────────────────────────────────

interface AccessToken {
  claims: Record<string, unknown>
}

export const ACCESS_TOKEN_TTL = 60 * 60 // seconds

export async function storeAccessToken(token: string, claims: Record<string, unknown>): Promise<void> {
  await useStorage('mcp-auth').setItem<AccessToken>(`token:${token}`, { claims }, { ttl: ACCESS_TOKEN_TTL })
}

export async function lookupAccessToken(token: string): Promise<boolean> {
  return await useStorage('mcp-auth').hasItem(`token:${token}`)
}

// ── JWT userinfo validation cache (jwt auth mode) ────────────────────────────

const VALIDATION_CACHE_TTL = 5 * 60 // seconds

// In-flight discovery promises — prevents concurrent duplicate fetches
const _oidcDiscoveryInFlight = new Map<string, Promise<string>>()
// Resolved endpoints (permanent cache — OIDC discovery docs don't change at runtime)
const _oidcDiscovery = new Map<string, string>()

function getOidcUserinfoEndpoint(issuer: string): Promise<string> {
  const cached = _oidcDiscovery.get(issuer)
  if (cached) return Promise.resolve(cached)

  const inflight = _oidcDiscoveryInFlight.get(issuer)
  if (inflight) return inflight

  const promise = $fetch<{ userinfo_endpoint?: string }>(`${issuer}/.well-known/openid-configuration`)
    .then((doc) => {
      const endpoint = doc.userinfo_endpoint ?? `${issuer}/userinfo`
      _oidcDiscovery.set(issuer, endpoint)
      return endpoint
    })
    .catch(() => `${issuer}/userinfo`)
    .finally(() => _oidcDiscoveryInFlight.delete(issuer))

  _oidcDiscoveryInFlight.set(issuer, promise)
  return promise
}

/**
 * Validate a Bearer token against an OIDC issuer's userinfo endpoint.
 * Results are cached in the shared storage for 5 minutes.
 */
export async function validateJwt(token: string, issuer: string): Promise<boolean> {
  const s = useStorage('mcp-auth')
  const cached = await s.getItem<boolean>(`jwt:${token}`)
  if (cached !== null) return cached

  const userinfoEndpoint = await getOidcUserinfoEndpoint(issuer)
  const valid = await $fetch(userinfoEndpoint, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(() => true).catch(() => false)

  await s.setItem(`jwt:${token}`, valid, { ttl: VALIDATION_CACHE_TTL })
  return valid
}
