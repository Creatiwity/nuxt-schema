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
      <button @click="removeInvoice">
        $fetch DELETE (204 No Content)
      </button>
      <button @click="deleteInvoice({ params: { id: 'testid', invoiceId: 'inv-1' } })">
        useMutation DELETE (204 No Content)
      </button>
    </section>

    <section>
      <h2>Schema (query)</h2>
      <p>Available at: <code>api.structure.$id.invoices.$get.schema.query</code></p>
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
  query: { query: 'ABC' },
})

// --- useQuery with select: `data` takes the type `select` returns ---
// Type checks only, never called: `npm run test:types` fails if one breaks.
function _useQueryTypeChecks() {
  // Without select, `data` is the success payload
  const { data: payload } = api.structure.$id.invoices.$get.useQuery({ params: { id: 'testid' } })
  const invoices: { invoices: string[] } | undefined = payload.value
  // @ts-expect-error `data` is the payload, not `any`
  const payloadIsNotAString: string = payload.value

  // With select, `data` is what select returns, from the payload it receives
  const { data: count } = api.structure.$id.invoices.$get.useQuery(
    { params: { id: 'testid' } },
    { select: result => result.invoices.length },
  )
  const invoiceCount: number | undefined = count.value
  // @ts-expect-error `data` is the selected number, not `any`
  const countIsNotAString: string = count.value

  // A select that expects another input than the payload is refused
  api.structure.$id.invoices.$get.useQuery(
    { params: { id: 'testid' } },
    // @ts-expect-error the payload has no `total`
    { select: (result: { total: number }) => result.total },
  )

  // Endpoints without options keep the same inference
  const { data: mode } = api.$get.useQuery(undefined, { select: () => true as const })
  const modeIsTrue: true | undefined = mode.value

  return { invoices, payloadIsNotAString, invoiceCount, countIsNotAString, modeIsTrue }
}

// --- useFetch (Nuxt composable) ---
const { data: nuxtData, pending: nuxtPending } = api.structure.$id.invoices.$get.useFetch({
  params: { id: 'testid' },
  query: { page: '2' },
})

// --- fetchQuery: imperative TanStack fetch (e.g. for prefetch in event handlers) ---
async function prefetch() {
  const result = await api.structure.$id.invoices.$get.fetchQuery(queryClient, {
    params: { id: 'testid' },
    query: { page: '1' },
  })
  // Pins the success payload: 4xx variants dropped, `data` unwrapped
  const invoices: { invoices: string[] } = result
  console.log('fetchQuery result:', invoices)
}

// --- useMutation on a 204 No Content route ---
const { mutateAsync: deleteInvoice } = api.structure.$id.invoices.$invoiceId.$delete.useMutation()

async function removeInvoice() {
  const result = await api.structure.$id.invoices.$invoiceId.$delete.$fetch({
    params: { id: 'testid', invoiceId: 'inv-1' },
  })
  // A success variant without `data` resolves to `null` — not `never`, which
  // would collapse Nuxt's `useFetch` Method generic and reject method: 'DELETE'.
  // Asserted both ways: `null = result` alone would also accept `never`.
  const noContent: null = result
  const roundTrip: typeof result = null
  console.log('delete result:', noContent, roundTrip)
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

// --- Schema access (library-agnostic, e.g. for form validation) ---
const querySchema = api.structure.$id.invoices.$get.schema.query
// Example: querySchema['~standard'].validate({ page: 1, query: 'ABC' })
const zodQueryDesc = querySchema
  ? `Schema available — shape: ${Object.keys((querySchema as { def?: { shape?: object } }).def?.shape ?? {}).join(', ') || 'n/a'}`
  : 'No query schema'
</script>
