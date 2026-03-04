/**
 * Example: override the fetch function used by all generated API calls.
 *
 * This is useful for handling 401s + token refresh transparently, adding
 * auth headers, or injecting any other cross-cutting HTTP behaviour.
 *
 * `setApiFetch` is auto-imported from @creatiwity/nuxt-schema.
 */
export default defineNuxtPlugin(() => {
  // Create a custom $fetch instance with an interceptor.
  // In a real app you would refresh the token and retry on 401.
  const authFetch = $fetch.create({
    // Example: attach a Bearer token to every request.
    // onRequest({ options }) {
    //   const token = useCookie('access-token').value
    //   if (token) options.headers = { ...options.headers, Authorization: `Bearer ${token}` }
    // },

    async onResponseError(context) {
      if (context.response.status === 401 && typeof context.options.retry !== 'number') {
        // Example: refresh the token, then let ofetch retry the original request automatically.
        // await $fetch('/api/auth/refresh', { method: 'POST' })
        console.warn('[auth-fetch] 401 received — token refresh would happen here')
        context.options.retry = 1
        context.options.retryStatusCodes = [401]
        context.options.retryDelay = 0
      }
    },
  })

  // All API calls (useQuery, fetchQuery, useFetch, $fetch) now go through authFetch.
  setApiFetch(authFetch)
})
