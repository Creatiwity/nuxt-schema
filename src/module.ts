import { createRequire } from 'node:module'
import { defineNuxtModule, createResolver, useNitro, addServerImportsDir, addServerScanDir, addTemplate, addImports, updateTemplates } from '@nuxt/kit'
import type { InputPluginOption } from 'rollup'
import { routeSchema, virtualPrefix } from './plugin'
import { generateApiFiles, generateApiTreeFile } from './generator'
import { glob } from 'tinyglobby'

// Module options TypeScript interface definition
export interface ModuleOptions {
  enabled?: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@creatiwity/nuxt-schema',
    configKey: 'nuxtSchema',
  },
  defaults: {},
  setup(options, nuxt) {
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

    // Register the main schema-api.ts template.
    // getContents is called lazily (during nuxi prepare and builds).
    const mainTemplate = addTemplate({
      filename: 'schema-api.ts',
      async getContents() {
        const endpoints = await generateApiFiles(
          nuxt.options.serverDir,
          nuxt.options.srcDir,
          nuxt.options.buildDir,
          hasTanstack,
          glob,
        )
        return generateApiTreeFile(endpoints)
      },
      write: true,
    })

    // Register api and useApi as auto-imports pointing to the generated file
    addImports([
      { name: 'api', from: mainTemplate.dst },
      { name: 'useApi', from: mainTemplate.dst },
    ])

    // Dev: re-generate when any server/api handler file changes
    nuxt.hook('builder:watch', async (_event, changedPath) => {
      if (
        /server\/api\/.*\.(?:get|post|put|patch|delete)\.ts$/.test(changedPath)
        || /shared\/schemas\/.*\.ts$/.test(changedPath)
      ) {
        await updateTemplates({
          filter: t => t.filename === 'schema-api.ts',
        })
      }
    })

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
