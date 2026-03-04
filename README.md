# @creatiwity/nuxt-schema

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

Nuxt module that brings schema-validated API handlers to your server routes and auto-generates a fully typed client API object for the frontend.

- [✨ &nbsp;Release Notes](/CHANGELOG.md)

## Features

- **`defineSchemaHandler`** — declare `input` (params, query, body) and `output` schemas on your Nitro handlers; validation runs automatically at runtime via [Standard Schema v1](https://github.com/standard-schema/standard-schema)
- **Generated `api` client** — for every `defineSchemaHandler` route, the module generates a typed client object auto-imported everywhere in your Nuxt app
- **TanStack Query integration** (optional) — `useQuery`, `fetchQuery` with reactive cache keys
- **Nuxt-native** — `useFetch` and `$fetch` variants always available
- **Cache key utilities** — `key()` returns a hierarchical key (`["structure", id, "invoices"]`) enabling precise cache invalidation
- **Custom fetch** — `setApiFetch()` to override the underlying fetch function globally (auth interceptors, token refresh, etc.)
- **Schema access** — `schema.params`, `schema.query`, `schema.body` on each endpoint for form validation reuse (works with any Standard Schema library)
- **OpenAPI metadata** — optional Nitro plugin that exposes route schemas as OpenAPI docs

---

## Installation

```bash
npx nuxi module add @creatiwity/nuxt-schema
```

Or manually:

```bash
npm install -D @creatiwity/nuxt-schema
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@creatiwity/nuxt-schema'],
})
```

### Optional: TanStack Query

If you want `useQuery` and `fetchQuery`, install `@tanstack/vue-query` and set up a Nuxt plugin:

```bash
npm install @tanstack/vue-query
```

```ts
// plugins/vue-query.ts
import type { DehydratedState, VueQueryPluginOptions } from '@tanstack/vue-query'
import { useState } from '#imports'
import { dehydrate, hydrate, QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

export default defineNuxtPlugin((nuxt) => {
  const vueQueryState = useState<DehydratedState | null>('vue-query')

  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 60000 } },
  })

  nuxt.vueApp.use(VueQueryPlugin, { queryClient } as VueQueryPluginOptions)

  if (import.meta.server) {
    nuxt.hooks.hook('app:rendered', () => {
      vueQueryState.value = dehydrate(queryClient)
    })
  }
  if (import.meta.client) {
    hydrate(queryClient, vueQueryState.value)
  }
})
```

The module auto-detects `@tanstack/vue-query` in your project and adds `useQuery`/`fetchQuery` to the generated client.

### Optional: Custom fetch (auth interceptors, token refresh)

By default all generated API calls use Nuxt's global `$fetch`. You can replace it with a custom instance via `setApiFetch`, which is auto-imported:

```ts
// plugins/auth-fetch.ts
export default defineNuxtPlugin(() => {
  const authFetch = $fetch.create({
    async onResponseError(context) {
      if (context.response.status === 401 && typeof context.options.retry !== 'number') {
        // Guard: if retry is already a number, a retry is in progress — avoid infinite loop
        // Refresh the token, then let ofetch retry the original request automatically
        await $fetch('/api/auth/refresh', { method: 'POST' })
        context.options.retry = 1
        context.options.retryStatusCodes = [401]
        context.options.retryDelay = 0
      }
    },
  })

  // All API calls (useQuery, fetchQuery, useFetch, $fetch) now go through authFetch
  setApiFetch(authFetch)
})
```

The override applies to every method on every generated endpoint: `useQuery`, `fetchQuery`, `$fetch`, and `useFetch` (via its `$fetch` option). Individual `useFetch` calls can still be overridden further by passing `$fetch` inside their `fetchOptions`.

---

## Usage

### 1. Define schemas in `shared/schemas/`

Place schemas in `shared/schemas/` so they are accessible on both server and client (Nuxt auto-imports them via the `#shared` alias).

```ts
// shared/schemas/invoices.ts
import z from 'zod/v4'

export const invoicesParams = z.object({ id: z.string() })

export const invoicesQuery = z.object({
  page: z.coerce.number().optional(),
  query: z.string().optional(),
})

export const invoicesResponse = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal(200),
    data: z.strictObject({ invoices: z.array(z.string()) }),
  }),
  z.strictObject({
    status: z.literal(404),
    data: z.strictObject({ error: z.string() }),
  }),
])
```

### 2. Create a validated handler

```ts
// server/api/structure/[id]/invoices.get.ts
import { invoicesParams, invoicesQuery, invoicesResponse } from '#shared/schemas/invoices'

export default defineSchemaHandler({
  input: {
    params: invoicesParams,
    query: invoicesQuery,
  },
  output: invoicesResponse,
}, ({ params, query }) => {
  return {
    status: 200 as const,
    data: { invoices: [`invoice-${params.id}-page${query.page ?? 1}`] },
  }
})
```

`defineSchemaHandler` validates `params`, `query`, and `body` at runtime. Invalid input returns a descriptive error. The output is also validated — a mismatch returns 500.

### 3. Use the generated `api` client

`api` and `useApi` are auto-imported everywhere in your Nuxt app. The API tree mirrors your file structure: dynamic segments `[id]` become `$id`, and the HTTP method becomes the terminal node `$get` / `$post` / etc.

```
server/api/structure/[id]/invoices.get.ts
→ api.structure.$id.invoices.$get
```

```vue
<script setup lang="ts">
// TanStack reactive query
const { data, isPending } = api.structure.$id.invoices.$get.useQuery({
  params: { id: 'abc' },
  query: { page: 1 },
})

// Nuxt native
const { data } = api.structure.$id.invoices.$get.useFetch({
  params: { id: 'abc' },
})
</script>
```

---

## Client API reference

### GET endpoints

```ts
// Reactive query (TanStack) — re-fetches when params/query change
const { data, isPending } = api.structure.$id.invoices.$get.useQuery(
  { params: { id: 'abc' }, query: { page: 1 } },
  queryOptions?, // Omit<UseQueryOptions, 'queryKey' | 'queryFn'>
)

// Imperative fetch (TanStack) — for prefetch or event handlers
const result = await api.structure.$id.invoices.$get.fetchQuery(
  queryClient,
  { params: { id: 'abc' } },
  queryOptions?,
)

// Nuxt native composable
const { data, pending } = api.structure.$id.invoices.$get.useFetch(
  { params: { id: 'abc' }, query: { page: 1 } },
  fetchOptions?,
)

// Raw fetch
const data = await api.structure.$id.invoices.$get.$fetch({ params: { id: 'abc' } })

// Cache key — params are interleaved with path segments for hierarchical invalidation
const key = api.structure.$id.invoices.$get.key({ params: { id: 'abc' }, query: { page: 1 } })
// → ["structure", "abc", "invoices", { page: 1 }]

// Invalidate all queries for this structure, regardless of sub-resource or query params
await queryClient.invalidateQueries({ queryKey: ["structure", "abc"] })

// Invalidate all invoices queries for this structure (any page/query)
await queryClient.invalidateQueries({ queryKey: ["structure", "abc", "invoices"] })

// Schema access — reuse schemas for form validation (works with any Standard Schema library)
const querySchema = api.structure.$id.invoices.$get.schema.query
querySchema.parse({ page: '2' }) // → { page: 2 }
```

**Type rules for GET options:**
- `params` is **required** when the route has dynamic segments (e.g. `[id]`)
- `query` is **optional** at the wrapper level; field-level required/optional is controlled by your schema

### POST / PATCH / PUT / DELETE endpoints

```ts
// Reactive mutation (TanStack)
const { mutate, isPending } = api.orders.$post.useMutation(mutationOptions?)
mutate(body)

// Nuxt native
const { data } = await api.orders.$post.useFetch(body, fetchOptions?)

// Raw fetch
await api.orders.$post.$fetch(body)
```

For endpoints with dynamic params:

```ts
await api.structure.$id.orders.$post.$fetch(body, { params: { id: 'abc' } })
```

---

## `defineSchemaHandler` options

The third argument to `defineSchemaHandler` is optional:

```ts
defineSchemaHandler(schema, handler, {
  // Override the H3 handler factory (useful for testing)
  defineHandler?: typeof defineEventHandler,

  // Called when input or output validation fails — use to log or report
  onValidationError?: (type: 'params' | 'query' | 'body' | 'output', result, event) => void,

  // Called when the handler throws an H3Error
  onH3Error?: (h3Error, event) => void,

  // Called when the handler throws any other error
  onHandlerError?: (error, event) => void,
})
```

---

## Module options

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@creatiwity/nuxt-schema'],
  nuxtSchema: {
    // Enables OpenAPI metadata extraction via a Nitro Rollup plugin.
    // Requires nitro.experimental.openAPI: true in your nuxt.config.
    enabled: false,
  },
})
```

---

## How code generation works

At `nuxi prepare` / `nuxi dev` startup, the module:

1. Scans `server/api/` for `*.get.ts`, `*.post.ts`, `*.put.ts`, `*.patch.ts`, `*.delete.ts`
2. Filters to files that contain `defineSchemaHandler`
3. Parses each handler's first argument to extract schema variable names and their import sources
4. Writes `.nuxt/schema-api/<endpoint>.ts` — one typed file per endpoint
5. Writes `.nuxt/schema-api.ts` — the `api` tree that imports all endpoints and is registered as an auto-import

During development, `builder:watch` triggers regeneration whenever a route handler or a `shared/schemas/**` file changes.

### Schema import convention

The generator traces schema imports to resolve types. Schemas must be importable from code that runs on the client (no server-only imports). Using `shared/schemas/` is the recommended pattern:

```ts
// ✅ Accessible on both client and server
import { mySchema } from '#shared/schemas/foo'
import { mySchema } from '~/shared/schemas/foo'

// ❌ Server-only — the generator cannot import this on the client
import { mySchema } from '~/server/utils/private-schema'
```

---

## Contribution

```bash
# Install dependencies
bun install

# Generate type stubs and prepare playground
npm run dev:prepare

# Start playground dev server
npm run dev

# Build the playground
npm run dev:build

# Run ESLint
npm run lint

# Run Vitest
npm run test
npm run test:watch

# Type check
npm run test:types

# Release
npm run release
```

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@creatiwity/nuxt-schema/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/@creatiwity/nuxt-schema

[npm-downloads-src]: https://img.shields.io/npm/dm/@creatiwity/nuxt-schema.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npm.chart.dev/@creatiwity/nuxt-schema

[license-src]: https://img.shields.io/npm/l/@creatiwity/nuxt-schema.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/@creatiwity/nuxt-schema

[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt.js
[nuxt-href]: https://nuxt.com
