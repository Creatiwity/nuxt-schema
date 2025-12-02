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
  },
})
