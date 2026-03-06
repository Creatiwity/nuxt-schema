export default defineNuxtConfig({
  modules: ['../src/module'],
  devtools: { enabled: true },
  compatibilityDate: '2025-12-02',
  nitro: {
    experimental: {
      openAPI: true,
    },
  },
  nuxtSchema: {
    enabled: true,
    mcp: {
      enabled: true,
      name: 'nuxt-schema-playground',
      version: '1.0.0',
      mode: 'opt-out',
      path: '/_mcp',
    },
  },
})
