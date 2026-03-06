import { defineNuxtPlugin, useRuntimeConfig, useRouter } from '#imports'

/**
 * Intercept client-side navigation to the MCP server endpoint and convert it
 * into a full browser navigation so Nitro handles it instead of Vue Router.
 * Without this, Vue Router warns "No match found for location with path /_mcp".
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const mcpPath = (config.public as Record<string, string>).mcpPath
  if (!mcpPath) return

  const router = useRouter()
  router.beforeEach((to) => {
    if (to.path === mcpPath || to.path.startsWith(`${mcpPath}/`)) {
      window.location.assign(to.fullPath)
      return false
    }
  })
})
