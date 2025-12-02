import { defineNuxtModule, createResolver, useNitro, addServerImportsDir } from '@nuxt/kit'
import type { InputPluginOption } from 'rollup'
import { routeSchema } from './plugin'

// Module options TypeScript interface definition
export interface ModuleOptions {
  mode?: false | 'zod'
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-schema',
    configKey: 'nuxtSchema',
  },
  // Default configuration options of the Nuxt module
  defaults: {},
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))

    const { mode } = options
    if (!mode) {
      return
    }

    nuxt.hook('ready', () => {
      const nitro = useNitro()

      nitro.hooks.hook('rollup:before', (nitro, config) => {
        const plugins = config.plugins as InputPluginOption[]

        const existingPlugin = plugins.findIndex(i => i && 'name' in i && i.name === 'import-meta')
        if (existingPlugin >= 0) {
          plugins.splice(existingPlugin, 0, routeSchema(nitro, resolver.resolve(`./runtime/server/utils/meta/${mode}`)))
        }
      })
    })
  },
})
