<template>
  <div style="font-family: monospace; padding: 2rem; max-width: 800px">
    <h1>nuxt-schema — api client demo</h1>

    <section>
      <h2>useQuery (TanStack)</h2>
      <p>Status: {{ isPending ? 'loading…' : 'loaded' }}</p>
      <pre>{{ JSON.stringify(data, null, 2) }}</pre>
    </section>

    <section>
      <h2>useFetch (Nuxt)</h2>
      <p>Status: {{ nuxtPending ? 'loading…' : 'loaded' }}</p>
      <pre>{{ JSON.stringify(nuxtData, null, 2) }}</pre>
    </section>

    <section>
      <h2>Actions</h2>
      <button @click="prefetch">
        fetchQuery (prefetch)
      </button>
      <button @click="invalidate">
        Invalidate cache for testid
      </button>
      <button @click="invalidateAll">
        Invalidate all invoices
      </button>
    </section>

    <section>
      <h2>Zod schema (query)</h2>
      <p>Available at: <code>api.structure.$id.invoices.$get.zod.query</code></p>
      <pre>{{ zodQueryDesc }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'

const queryClient = useQueryClient()

// --- useQuery (TanStack reactive) ---
const { data, isPending } = api.structure.$id.invoices.$get.useQuery({
  params: { id: 'testid' },
  query: { page: 1, query: 'ABC' },
})

// --- useFetch (Nuxt composable) ---
const { data: nuxtData, pending: nuxtPending } = api.structure.$id.invoices.$get.useFetch({
  params: { id: 'testid' },
  query: { page: 2 },
})

// --- fetchQuery: imperative TanStack fetch (e.g. for prefetch in event handlers) ---
async function prefetch() {
  const result = await api.structure.$id.invoices.$get.fetchQuery(queryClient, {
    params: { id: 'testid' },
    query: { page: 1 },
  })
  console.log('fetchQuery result:', result)
}

// --- Cache invalidation via key ---
async function invalidate() {
  // Invalidates all queries for params.id === 'testid' (any page/query)
  await queryClient.invalidateQueries({
    queryKey: api.structure.$id.invoices.$get.key({ params: { id: 'testid' } }),
  })
}

async function invalidateAll() {
  // Invalidates ALL invoices queries (any id, any query params)
  await queryClient.invalidateQueries({
    queryKey: api.structure.$id.invoices.$get.key({ params: { id: 'testid' } }).slice(0, -1),
  })
}

// --- Zod schema access (e.g. for form validation) ---
const zodQuerySchema = api.structure.$id.invoices.$get.zod.query
// Example: zodQuerySchema.parse({ page: 1, query: 'ABC' }) → { page: 1, query: 'ABC' }
const zodQueryDesc = zodQuerySchema
  ? `Zod schema available — shape: ${Object.keys((zodQuerySchema).def?.shape ?? {}).join(', ') || 'n/a'}`
  : 'No query schema'
</script>
