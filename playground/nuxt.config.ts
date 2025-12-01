export default defineNuxtConfig({
  modules: ['../src/module'],
  devtools: { enabled: true },
  nitro: {
    experimental: {
      openAPI: true,
    },
  },
  myModule: {},
})
