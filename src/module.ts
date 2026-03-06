import { createRequire } from 'node:module'
import { defineNuxtModule, createResolver, useNitro, addServerImportsDir, addServerScanDir, addTemplate, addImports, updateTemplates, addServerHandler, addPlugin } from '@nuxt/kit'
import type { InputPluginOption } from 'rollup'
import { routeSchema, virtualPrefix } from './plugin'
import { generateApiFiles, generateApiTreeFile, generateApiFetchConfigFile, generateMcpFile } from './generator'
import { glob } from 'tinyglobby'

// Module options TypeScript interface definition
export interface ModuleOptions {
  enabled?: boolean
  mcp?: {
    enabled: boolean
    name?: string
    version?: string
    mode?: 'opt-in' | 'opt-out'
    path?: string
    auth?: { type: 'bearer', token: string }
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@creatiwity/nuxt-schema',
    configKey: 'nuxtSchema',
  },
  defaults: {},
  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addServerScanDir(virtualPrefix)

    // Detect @tanstack/vue-query in the user's project
    const _require = createRequire(nuxt.options.rootDir + '/package.json')
    let hasTanstack = false
    try {
      _require.resolve('@tanstack/vue-query')
      hasTanstack = true
    }
    catch {
      // @tanstack/vue-query not installed — skip TanStack-specific code generation
    }

    // Register the fetch config file (holds the overridable _apiFetch reference).
    const apiFetchConfig = generateApiFetchConfigFile()
    addTemplate({
      filename: 'schema-api-fetch.ts',
      getContents: () => apiFetchConfig,
      write: true,
    })

    // Shared endpoint list used by both schema-api.ts and schema-mcp.ts
    let _cachedEndpoints: Awaited<ReturnType<typeof generateApiFiles>> = []

    async function getEndpoints() {
      if (_cachedEndpoints.length) return _cachedEndpoints
      _cachedEndpoints = await generateApiFiles(
        nuxt.options.serverDir,
        nuxt.options.srcDir,
        nuxt.options.buildDir,
        hasTanstack,
        glob,
      )
      return _cachedEndpoints
    }

    // Register the main schema-api.ts template.
    // getContents is called lazily (during nuxi prepare and builds).
    const mainTemplate = addTemplate({
      filename: 'schema-api.ts',
      async getContents() {
        const endpoints = await getEndpoints()
        return generateApiTreeFile(endpoints)
      },
      write: true,
    })

    // Register api, useApi and setApiFetch as auto-imports
    addImports([
      { name: 'api', from: mainTemplate.dst },
      { name: 'useApi', from: mainTemplate.dst },
      { name: 'setApiFetch', from: mainTemplate.dst },
    ])

    // Dev: re-generate when any server/api handler file changes
    nuxt.hook('builder:watch', async (_event, changedPath) => {
      if (
        /server\/api\/.*\.(?:get|post|put|patch|delete)\.ts$/.test(changedPath)
        || /shared\/schemas\/.*\.ts$/.test(changedPath)
      ) {
        _cachedEndpoints = []
        await updateTemplates({
          filter: t => t.filename === 'schema-api.ts' || t.filename === 'schema-mcp.ts',
        })
      }
    })

    // MCP server setup (opt-in via mcp.enabled)
    const mcpOptions = options.mcp
    if (mcpOptions?.enabled) {
      const mcpMode = mcpOptions.mode ?? 'opt-out'
      const mcpPath = mcpOptions.path ?? '/_mcp'
      // Expose runtimeConfig values for the MCP handler (server-only)
      nuxt.options.runtimeConfig.mcpName = mcpOptions.name ?? ''
      nuxt.options.runtimeConfig.mcpVersion = mcpOptions.version ?? '1.0.0'
      nuxt.options.runtimeConfig.mcpAuthToken = mcpOptions.auth?.token ?? ''

      // Expose MCP path publicly so the client router guard can read it
      nuxt.options.runtimeConfig.public ??= {}
      nuxt.options.runtimeConfig.public.mcpPath = mcpPath

      // Generate schema-mcp.ts
      const mcpTemplate = addTemplate({
        filename: 'schema-mcp.ts',
        async getContents() {
          const endpoints = await getEndpoints()
          return generateMcpFile(endpoints, mcpMode)
        },
        write: true,
      })

      // Alias #schema-mcp → generated file (used by the MCP handler)
      nuxt.options.alias['#schema-mcp'] = mcpTemplate.dst

      // Register the MCP event handler at the configured path
      addServerHandler({
        route: mcpPath,
        handler: resolver.resolve('./runtime/server/api/mcp'),
      })

      // Client plugin: intercept navigation to the MCP path so Vue Router doesn't warn
      addPlugin({
        src: resolver.resolve('./runtime/plugins/mcp-server-guard.client'),
        mode: 'client',
      })
    }

    // Nitro OpenAPI metadata extraction (existing feature, requires enabled: true)
    const { enabled } = options
    if (!enabled) {
      return
    }

    nuxt.hook('ready', () => {
      const nitro = useNitro()

      nitro.hooks.hook('rollup:before', (nitro, config) => {
        const plugins = config.plugins as InputPluginOption[]

        const existingPlugin = plugins.findIndex(i => i && 'name' in i && i.name === 'import-meta')
        if (existingPlugin >= 0) {
          plugins.splice(existingPlugin, 0, routeSchema(nitro as unknown as Parameters<typeof routeSchema>[0]))
        }
      })
    })
  },
})
