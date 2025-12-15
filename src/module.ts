import { defineNuxtModule, createResolver, useNitro, addServerImportsDir, addServerScanDir } from '@nuxt/kit'
import type { InputPluginOption } from 'rollup'
import { routeSchema, virtualPrefix } from './plugin'

// Module options TypeScript interface definition
export interface ModuleOptions {
  enabled?: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@creatiwity/nuxt-schema',
    configKey: 'nuxtSchema',
  },
  // Default configuration options of the Nuxt module
  defaults: {},
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addServerScanDir(virtualPrefix)

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
          plugins.splice(existingPlugin, 0, routeSchema(nitro))
        }
      })
    })
  },
})
