import { readFileSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { resolve, dirname, relative, join } from 'node:path'
import { transformSync } from 'oxc-transform'

export interface SchemaImport {
  name: string
  from: string
}

export interface EndpointInfo {
  fileKey: string
  method: string
  pathSegments: string[]
  hasDynamicParams: boolean
  schemaImports: {
    params?: SchemaImport
    query?: SchemaImport
    body?: SchemaImport
    output?: SchemaImport
  }
  usesDefineSchema: boolean
  description?: string
  mcp?: boolean
  mcpName?: string
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface SchemaInfo {
  schemaImports: EndpointInfo['schemaImports']
  description?: string
  mcp?: boolean
  mcpName?: string
}

/**
 * Extract schema variable references, description, and mcp flag from the
 * transformed JS of a handler file.
 */
function extractSchemaInfo(
  jsCode: string,
  filePath: string,
  srcDir: string,
): SchemaInfo {
  // Build a map: varName → importSource
  const importMap: Record<string, string> = {}
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = importRegex.exec(jsCode)) !== null) {
    const source = m[2]!
    for (let part of m[1]!.split(',')) {
      part = part.trim()
      if (!part) continue
      // "name as alias" → use alias
      const alias = part.split(/\s+as\s+/).pop()!.trim()
      importMap[alias] = source
    }
  }

  // Locate defineSchemaHandler( and extract its first argument using bracket depth
  const handlerIdx = jsCode.indexOf('defineSchemaHandler(')
  if (handlerIdx === -1) return { schemaImports: {} }

  const startIdx = handlerIdx + 'defineSchemaHandler('.length
  let depth = 0
  let firstArgEnd = -1
  for (let i = startIdx; i < jsCode.length; i++) {
    const c = jsCode[i]
    if (c === '(' || c === '{' || c === '[') {
      depth++
    }
    else if (c === ')' || c === '}' || c === ']') {
      if (depth === 0) {
        firstArgEnd = i
        break
      }
      depth--
    }
    else if (c === ',' && depth === 0) {
      firstArgEnd = i
      break
    }
  }
  if (firstArgEnd === -1) return { schemaImports: {} }

  const schemaArg = jsCode.slice(startIdx, firstArgEnd)

  // Extract description, mcp flag, and mcpName from top-level fields
  const description = schemaArg.match(/description\s*:\s*['"`]([^'"`\n]+)['"`]/)?.[1]
  const mcpRaw = schemaArg.match(/\bmcp\s*:\s*(true|false)/)?.[1]
  const mcp = mcpRaw === 'true' ? true : mcpRaw === 'false' ? false : undefined
  const mcpName = schemaArg.match(/mcpName\s*:\s*['"`]([^'"`\n]+)['"`]/)?.[1]

  // Extract variable names from input: { params: X, query: Y, body: Z }
  const inputMatch = schemaArg.match(/input\s*:\s*\{([^}]+)\}/)
  const inputBlock = inputMatch?.[1] ?? ''

  const paramsVar = inputBlock.match(/params\s*:\s*(\w+)/)?.[1]
  const queryVar = inputBlock.match(/query\s*:\s*(\w+)/)?.[1]
  const bodyVar = inputBlock.match(/body\s*:\s*(\w+)/)?.[1]

  // Top-level output schema (not inside input block)
  const outputVar = schemaArg.match(/\boutput\s*:\s*(\w+)/)?.[1]

  const fileDir = dirname(filePath)

  function resolveImport(varName: string | undefined): SchemaImport | undefined {
    if (!varName) return undefined
    const src = importMap[varName]
    if (!src) return undefined

    // Already an alias (starts with #, @/, ~/) — use as-is
    if (!src.startsWith('.')) {
      return { name: varName, from: src }
    }

    // Relative path → convert to ~/ alias (relative to srcDir)
    const abs = resolve(fileDir, src)
    const rel = relative(srcDir, abs).replace(/\\/g, '/')
    return { name: varName, from: '~/' + rel }
  }

  return {
    schemaImports: {
      params: resolveImport(paramsVar),
      query: resolveImport(queryVar),
      body: resolveImport(bodyVar),
      output: resolveImport(outputVar),
    },
    description,
    mcp,
    mcpName,
  }
}

/**
 * Parse a route file (relative to apiDir) into an EndpointInfo.
 */
export function parseEndpoint(file: string, apiDir: string, srcDir: string): EndpointInfo {
  const withoutExt = file.replace(/\.ts$/, '')
  const parts = withoutExt.split('/')
  const lastPart = parts[parts.length - 1]!
  const methodMatch = lastPart.match(/^(.+)\.(get|post|put|patch|delete)$/)
  if (!methodMatch) throw new Error(`Cannot parse method from file: ${file}`)

  const method = methodMatch[2]!
  const lastSegmentName = methodMatch[1] === 'index' ? null : methodMatch[1]!

  const rawSegments = [
    ...parts.slice(0, -1),
    ...(lastSegmentName ? [lastSegmentName] : []),
  ]

  // Convert [param] → $param (supports hyphens and other non-word chars, e.g. [user-id])
  const pathSegments = rawSegments.map(p => p.replace(/^\[([^\]]+)\]$/, '$$$1'))
  const hasDynamicParams = pathSegments.some(p => p.startsWith('$'))

  // File key: segments joined with -- then .method  (e.g. structure--$id--invoices.get)
  const fileKey = (pathSegments.length ? pathSegments.join('--') + '.' : '') + method

  const filePath = resolve(apiDir, file)
  let schemaImports: EndpointInfo['schemaImports'] = {}
  let description: string | undefined
  let mcp: boolean | undefined
  let mcpName: string | undefined
  let usesDefineSchema = false
  try {
    const raw = readFileSync(filePath, 'utf-8')
    usesDefineSchema = raw.includes('defineSchemaHandler')
    if (usesDefineSchema) {
      const { code } = transformSync(filePath, raw)
      const info = extractSchemaInfo(code, filePath, srcDir)
      schemaImports = info.schemaImports
      description = info.description
      mcp = info.mcp
      mcpName = info.mcpName
    }
  }
  catch {
    // Non-critical: file might have syntax errors, skip schema extraction
  }

  return { fileKey, method, pathSegments, hasDynamicParams, schemaImports, usesDefineSchema, description, mcp, mcpName }
}

// ---------------------------------------------------------------------------
// Code generation helpers
// ---------------------------------------------------------------------------

/**
 * A compact type helper that infers the output type of any Standard Schema V1
 * compatible schema (Zod v4, Valibot, etc.) without requiring an import.
 */
const TYPE_HELPER = `type _O<T> = T extends { '~standard': { types?: { output?: infer O } | undefined } } ? NonNullable<O> : unknown
type _I<T> = T extends { '~standard': { types?: { input?: infer O } | undefined } } ? NonNullable<O> : unknown`

// Returns true if name is a valid JS identifier (no quotes needed)
const isSimpleIdent = (name: string) => /^[$_a-z][\w$]*$/i.test(name)

// Converts a kebab-case segment (optionally prefixed with $) to camelCase
// e.g. "my-feature" → "myFeature", "$user-id" → "$userId"
function toJsKey(segment: string): string {
  const hasDollar = segment.startsWith('$')
  const name = hasDollar ? segment.slice(1) : segment
  const camel = name.replace(/-([a-z\d])/gi, (_, c: string) => c.toUpperCase())
  return hasDollar ? `$${camel}` : camel
}

// Builds a _key() function that interleaves param values with path segments.
// e.g. ["structure", params.id, "invoices", ...(query !== undefined ? [query] : [])]
// This enables partial key matching for TanStack Query cache invalidation.
function buildKeyFn(pathSegments: string[], paramsType: string | null, queryType: string | null): string {
  const args: string[] = []
  if (paramsType) args.push(`params: ${paramsType}`)
  if (queryType) args.push(`query?: ${queryType}`)

  const keyParts: string[] = []
  for (const s of pathSegments) {
    if (!s.startsWith('$')) {
      keyParts.push(JSON.stringify(s))
    }
    else if (paramsType) {
      const name = s.slice(1)
      keyParts.push(isSimpleIdent(name) ? `params.${name}` : `params['${name}']`)
    }
  }

  const querySpread = queryType ? `, ...(query !== undefined ? [query] : [])` : ''
  return `function _key(${args.join(', ')}): unknown[] { return [${keyParts.join(', ')}${querySpread}] }`
}

function buildUrlFn(pathSegments: string[]): string {
  if (!pathSegments.some(s => s.startsWith('$'))) {
    const url = '/api/' + pathSegments.join('/')
    return `function _url() { return '${url}' }`
  }
  const paramFields: string[] = []
  const urlParts = pathSegments.map((s) => {
    if (!s.startsWith('$')) return s
    const name = s.slice(1)
    paramFields.push(isSimpleIdent(name) ? `${name}: string` : `'${name}': string`)
    return `\${params${isSimpleIdent(name) ? `.${name}` : `['${name}']`}}`
  })
  return `function _url(params: { ${paramFields.join('; ')} }) { return \`/api/${urlParts.join('/')}\` }`
}

// ---------------------------------------------------------------------------
// Endpoint file generation
// ---------------------------------------------------------------------------

export function generateEndpointFile(ep: EndpointInfo, hasTanstack: boolean): string {
  const { method, pathSegments, hasDynamicParams, schemaImports } = ep
  const isGet = method === 'get'
  const methodUpper = method.toUpperCase()

  // Schema variable names
  const sv = {
    params: schemaImports.params?.name,
    query: schemaImports.query?.name,
    body: schemaImports.body?.name,
    output: schemaImports.output?.name,
  }

  // Group schema imports by source file
  const importsBySource: Record<string, Set<string>> = {}
  for (const ref of [schemaImports.params, schemaImports.query, schemaImports.body, schemaImports.output]) {
    if (!ref) {
      continue
    }

    (importsBySource[ref.from] ??= new Set()).add(ref.name)
  }

  const lines: string[] = [
    `// Auto-generated by @creatiwity/nuxt-schema — DO NOT EDIT`,
    `// Route: ${methodUpper} /api/${pathSegments.join('/')}`,
    ``,
  ]

  // Framework imports
  if (hasTanstack) {
    if (isGet) {
      lines.push(`import { useQuery, type QueryClient } from '@tanstack/vue-query'`)
      lines.push(`import type { UseQueryOptions } from '@tanstack/vue-query'`)
    }
    else {
      lines.push(`import { useMutation } from '@tanstack/vue-query'`)
      lines.push(`import type { UseMutationOptions } from '@tanstack/vue-query'`)
    }
  }
  lines.push(`import { useFetch } from '#app'`)
  lines.push(`import { _apiFetch } from '../schema-api-fetch'`)
  if (isGet && hasTanstack) {
    lines.push(`import { computed, toValue } from 'vue'`)
    lines.push(`import type { MaybeRefOrGetter } from 'vue'`)
  }

  // Schema imports
  for (const [from, names] of Object.entries(importsBySource)) {
    lines.push(`import { ${[...names].join(', ')} } from '${from}'`)
  }

  lines.push(``)
  lines.push(TYPE_HELPER)
  if (sv.output) {
    lines.push(`type _SD<O> = O extends { status: infer S extends number; data: infer D } ? \`\${S}\` extends \`4\${string}\` | \`5\${string}\` ? never : D : never`)
    lines.push(`type _DO = _SD<_O<typeof ${sv.output}>>`)
  }
  lines.push(``)
  // Inferred TypeScript types from schemas
  const paramsType = sv.params ? `_I<typeof ${sv.params}>` : null
  const queryType = sv.query ? `_I<typeof ${sv.query}>` : null
  const bodyType = sv.body ? `_I<typeof ${sv.body}>` : null
  const needsParams = hasDynamicParams && !!paramsType

  lines.push(buildKeyFn(pathSegments, needsParams ? paramsType : null, queryType))
  lines.push(``)
  lines.push(buildUrlFn(pathSegments))
  lines.push(``)

  // Build the options object type for GET methods
  // params is required when route has dynamic segments
  // query is always optional at the wrapper level (field-level required is controlled by the schema)
  function buildGetOptionsType(reactive: boolean): string | null {
    const fields: string[] = []
    if (needsParams) fields.push(`params: ${paramsType}`)
    if (queryType) fields.push(`query?: ${queryType}`)
    if (!fields.length) return null
    const inner = `{ ${fields.join('; ')} }`
    return reactive && hasTanstack ? `MaybeRefOrGetter<${inner} | null>` : inner
  }

  // Helper: access options value (reactive vs plain)
  const tv = (expr: string) => (hasTanstack ? `toValue(${expr})` : expr)

  // Type generic for _apiFetch / useFetch — populated when output schema is available
  const fetchG = sv.output ? '<_DO>' : ''

  const methods: string[] = []

  if (isGet) {
    const reactiveOptionsType = buildGetOptionsType(true)
    const plainOptionsType = buildGetOptionsType(false)

    const reactiveDecl = reactiveOptionsType
      ? `options${hasDynamicParams ? '' : '?'}: ${reactiveOptionsType}`
      : null
    const plainDecl = plainOptionsType
      ? `options${hasDynamicParams ? '' : '?'}: ${plainOptionsType}`
      : null

    // Helpers to access params/query from (possibly reactive) options
    const optAccess = (field: string) =>
      hasDynamicParams
        ? `${tv('options')}.${field}`
        : `${tv('options')}?.${field}`
    // urlCall uses toValue (reactive, for useQuery); fetchUrlCall is plain (fetchQuery/$fetch)
    const urlCall = hasDynamicParams ? `_url(${optAccess('params')})` : `_url()`
    const fetchUrlCall = hasDynamicParams ? `_url(options.params)` : `_url()`

    // Key parts for queryKey
    const keyParamsPart = needsParams ? `options.params` : null
    const keyQueryPart = queryType ? `options${hasDynamicParams ? '' : '?'}.query` : null

    const buildKeyCall = (paramsExpr: string | null, queryExpr: string | null) =>
      `_key(${[paramsExpr, queryExpr].filter(Boolean).join(', ')})`

    if (hasTanstack) {
      // useQuery (reactive options via MaybeRefOrGetter)
      const uqArgs = [
        reactiveDecl ?? null,
        `queryOptions?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>`,
      ].filter(Boolean).join(', ')

      // When the endpoint has options (params/query), support null to disable the query.
      // null means "required data not yet available" → enabled: false.
      // When there are no options at all (no params, no query), null handling is irrelevant.
      const hasOptions = reactiveDecl !== null
      if (hasOptions) {
        const uqKeyCallWithVar = buildKeyCall(
          needsParams ? `_o.params` : null,
          queryType ? `_o?.query` : null,
        )
        const urlCallWithVar = hasDynamicParams ? `_url(_o.params)` : `_url()`
        const queryFnBody = `{ const _o = toValue(options)!; return _apiFetch${fetchG}(${urlCallWithVar}${queryType ? `, { query: _o?.query }` : ''}) }`

        methods.push(
          `  useQuery: (${uqArgs}) => useQuery({\n`
          + `    queryKey: computed(() => { const _o = toValue(options); return _o !== null ? ${uqKeyCallWithVar} : [] }),\n`
          + `    queryFn: () => ${queryFnBody},\n`
          + `    ...queryOptions,\n`
          + `    enabled: computed(() => toValue(options) !== null),\n`
          + `  }),`,
        )
      }
      else {
        const uqKeyCall = buildKeyCall(null, null)

        methods.push(
          `  useQuery: (${uqArgs}) => useQuery({\n`
          + `    queryKey: computed(() => ${uqKeyCall}),\n`
          + `    queryFn: () => _apiFetch${fetchG}(${urlCall}),\n`
          + `    ...queryOptions,\n`
          + `  }),`,
        )
      }

      // fetchQuery (plain options, uses queryClient)
      const fqArgs = [
        `queryClient: QueryClient`,
        plainDecl ?? null,
        `queryOptions?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>`,
      ].filter(Boolean).join(', ')

      methods.push(
        `  fetchQuery: (${fqArgs}) => queryClient.fetchQuery({\n`
        + `    queryKey: ${buildKeyCall(keyParamsPart, keyQueryPart)},\n`
        + `    queryFn: () => _apiFetch${fetchG}(${fetchUrlCall}${queryType ? `, { query: options${hasDynamicParams ? '' : '?'}.query }` : ''}),\n`
        + `    ...queryOptions,\n`
        + `  }),`,
      )

      methods.push(
        `  ensureQueryData: (${fqArgs}) => queryClient.ensureQueryData({\n`
        + `    queryKey: ${buildKeyCall(keyParamsPart, keyQueryPart)},\n`
        + `    queryFn: () => _apiFetch${fetchG}(${fetchUrlCall}${queryType ? `, { query: options${hasDynamicParams ? '' : '?'}.query }` : ''}),\n`
        + `    ...queryOptions,\n`
        + `  }),`,
      )
    }

    // useFetch (always generated)
    const ufArgs = [
      plainDecl ?? null,
      `fetchOptions?: Record<string, unknown>`,
    ].filter(Boolean).join(', ')

    const ufUrlArg = hasDynamicParams ? `() => _url(options.params)` : `_url`

    methods.push(
      `  useFetch: (${ufArgs}) => useFetch${fetchG}(${ufUrlArg}${queryType ? `, { query: options${hasDynamicParams ? '' : '?'}.query, $fetch: _apiFetch, ...fetchOptions }` : `, { $fetch: _apiFetch, ...fetchOptions }`}),`,
    )

    // $fetch (always generated)
    const fetchArgs = plainDecl ?? null
    methods.push(
      `  $fetch: (${fetchArgs ?? ''}) => _apiFetch${fetchG}(${fetchUrlCall}${queryType ? `, { query: options${hasDynamicParams ? '' : '?'}.query }` : ''}),`,
    )

    // key — same required/optional rule as useQuery but plain (not reactive)
    const keyArgs = plainDecl ?? null
    methods.push(
      `  key: (${keyArgs ?? ''}) => ${buildKeyCall(keyParamsPart, keyQueryPart)},`,
    )
  }
  else {
    // Mutation methods
    const mutParamsDecl = hasDynamicParams && paramsType
      ? `options: { params: ${paramsType} }`
      : null
    const mutUrlCall = hasDynamicParams ? `_url(options.params)` : `_url()`

    if (hasTanstack) {
      const mutArgs = [
        mutParamsDecl,
        `mutationOptions?: Omit<UseMutationOptions, 'mutationFn'>`,
      ].filter(Boolean).join(', ')

      const bodyDecl = bodyType ? `body: ${bodyType}` : `body?: unknown`

      methods.push(
        `  useMutation: (${mutArgs}) => useMutation({\n`
        + `    mutationFn: (${bodyDecl}) => _apiFetch${fetchG}(${mutUrlCall}, { method: '${methodUpper}'${bodyType ? ', body' : ''} }),\n`
        + `    ...mutationOptions,\n`
        + `  }),`,
      )
    }

    // useFetch / $fetch for mutations — share the same base args (body + optional params)
    const mutBaseArgs = [
      bodyType ? `body: ${bodyType}` : `body?: unknown`,
      mutParamsDecl,
    ].filter(Boolean)

    const ufUrlArg = hasDynamicParams ? `() => ${mutUrlCall}` : `_url`
    methods.push(
      `  useFetch: (${[...mutBaseArgs, `fetchOptions?: Record<string, unknown>`].join(', ')}) => useFetch${fetchG}(${ufUrlArg}, { method: '${methodUpper}'${bodyType ? ', body' : ''}, $fetch: _apiFetch, ...fetchOptions }),`,
    )

    methods.push(
      `  $fetch: (${mutBaseArgs.join(', ')}) => _apiFetch${fetchG}(${mutUrlCall}, { method: '${methodUpper}'${bodyType ? ', body' : ''} }),`,
    )
  }

  // schema accessor — library-agnostic (works with Zod, Valibot, ArkType, etc.)
  const schemaEntries: string[] = []
  if (sv.params) schemaEntries.push(`    params: ${sv.params}`)
  if (sv.query) schemaEntries.push(`    query: ${sv.query}`)
  if (sv.body) schemaEntries.push(`    body: ${sv.body}`)
  if (schemaEntries.length) {
    methods.push(`  schema: {\n${schemaEntries.join(',\n')},\n  },`)
  }

  lines.push(`export default {`)
  lines.push(methods.join('\n\n'))
  lines.push(`}`)

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// API tree file generation
// ---------------------------------------------------------------------------

interface TreeNode {
  children: Record<string, TreeNode>
  endpoints: Array<{ method: string, varName: string }>
}

function buildTree(endpoints: EndpointInfo[], varNames: string[]): TreeNode {
  const root: TreeNode = { children: {}, endpoints: [] }
  for (let i = 0; i < endpoints.length; i++) {
    const ep = endpoints[i]!
    const varName = varNames[i]!
    let node = root
    for (const seg of ep.pathSegments) {
      node.children[seg] ??= { children: {}, endpoints: [] }
      node = node.children[seg]!
    }
    node.endpoints.push({ method: ep.method, varName })
  }
  return root
}

function renderNode(node: TreeNode, indent: number): string {
  const pad = '  '.repeat(indent)
  const parts: string[] = []

  for (const { method, varName } of node.endpoints) {
    parts.push(`${pad}$${method}: ${varName}`)
  }
  for (const [key, child] of Object.entries(node.children)) {
    const inner = renderNode(child, indent + 1)
    const jsKey = toJsKey(key)
    parts.push(`${pad}${jsKey}: {\n${inner}\n${pad}}`)
  }
  return parts.join(',\n')
}

export function generateApiTreeFile(endpoints: EndpointInfo[]): string {
  if (endpoints.length === 0) {
    return [
      `// Auto-generated by @creatiwity/nuxt-schema — DO NOT EDIT`,
      `export const api = {}`,
      `export function useApi() { return api }`,
    ].join('\n')
  }

  const varNames = endpoints.map(ep =>
    `_ep_${ep.fileKey.replace(/[.\-$]/g, '_')}`,
  )

  const imports = endpoints.map((ep, i) =>
    `import ${varNames[i]} from './schema-api/${ep.fileKey}'`,
  )

  const tree = renderNode(buildTree(endpoints, varNames), 1)

  return [
    `// Auto-generated by @creatiwity/nuxt-schema — DO NOT EDIT`,
    `export { setApiFetch } from './schema-api-fetch'`,
    ``,
    ...imports,
    ``,
    `export const api = {`,
    tree,
    `}`,
    ``,
    `export function useApi() { return api }`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// MCP file generation
// ---------------------------------------------------------------------------

export function generateMcpFile(
  endpoints: EndpointInfo[],
  mode: 'opt-in' | 'opt-out',
): string {
  // Filter endpoints based on mcp flag and module mode
  const mcpEndpoints = endpoints.filter((ep) => {
    if (ep.mcp === true) return true
    if (ep.mcp === false) return false
    return mode !== 'opt-in'
  })

  // Collect schema imports grouped by source
  const importsBySource: Record<string, Set<string>> = {}
  for (const ep of mcpEndpoints) {
    for (const ref of [ep.schemaImports.params, ep.schemaImports.query, ep.schemaImports.body]) {
      if (!ref) {
        continue
      }
      (importsBySource[ref.from] ??= new Set()).add(ref.name)
    }
  }

  // Build pathTemplate: converts $param segments to {param} for proxy substitution
  function buildPathTemplate(pathSegments: string[]): string {
    return '/api/' + pathSegments.map(s => s.startsWith('$') ? `{${s.slice(1)}}` : s).join('/')
  }

  const lines: string[] = [
    `// Auto-generated by @creatiwity/nuxt-schema — DO NOT EDIT`,
    ``,
  ]

  for (const [from, names] of Object.entries(importsBySource)) {
    lines.push(`import { ${[...names].join(', ')} } from '${from}'`)
  }

  lines.push(``)
  lines.push(`export const mcpTools = [`)
  for (const ep of mcpEndpoints) {
    const { method, pathSegments, schemaImports, description, fileKey, mcpName } = ep
    const toolName = mcpName ?? fileKey.replace(/[.$]/g, '-').replace(/-+/g, '-')
    lines.push(`  {`)
    lines.push(`    name: ${JSON.stringify(toolName)},`)
    if (description) lines.push(`    description: ${JSON.stringify(description)},`)
    lines.push(`    method: ${JSON.stringify(method.toUpperCase())},`)
    lines.push(`    pathTemplate: ${JSON.stringify(buildPathTemplate(pathSegments))},`)
    lines.push(`    paramsSchema: ${schemaImports.params?.name ?? 'undefined'},`)
    lines.push(`    querySchema: ${schemaImports.query?.name ?? 'undefined'},`)
    lines.push(`    bodySchema: ${schemaImports.body?.name ?? 'undefined'},`)
    lines.push(`  },`)
  }
  lines.push(`]`)

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Fetch config file generation
// ---------------------------------------------------------------------------

export function generateApiFetchConfigFile(): string {
  return [
    `// Auto-generated by @creatiwity/nuxt-schema — DO NOT EDIT`,
    `export let _apiFetch: typeof $fetch = $fetch`,
    ``,
    `export function setApiFetch(fn: typeof $fetch) {`,
    `  _apiFetch = fn`,
    `}`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Main generation entry point
// ---------------------------------------------------------------------------

export async function generateApiFiles(
  serverDir: string,
  srcDir: string,
  buildDir: string,
  hasTanstack: boolean,
  glob: (patterns: string[], options: { cwd: string }) => Promise<string[]>,
): Promise<EndpointInfo[]> {
  const apiDir = resolve(serverDir, 'api')

  let files: string[] = []
  try {
    files = await glob(
      ['**/*.get.ts', '**/*.post.ts', '**/*.put.ts', '**/*.patch.ts', '**/*.delete.ts'],
      { cwd: apiDir },
    )
  }
  catch {
    return []
  }

  if (!files.length) return []

  const endpoints = files
    .map(f => parseEndpoint(f, apiDir, srcDir))
    .filter(ep => ep.usesDefineSchema)

  // Write individual endpoint files into .nuxt/schema-api/
  const schemaApiDir = join(buildDir, 'schema-api')
  mkdirSync(schemaApiDir, { recursive: true })

  // Remove stale files from previous runs (deleted/renamed routes)
  const expectedFiles = new Set(endpoints.map(ep => `${ep.fileKey}.ts`))
  for (const file of readdirSync(schemaApiDir)) {
    if (file.endsWith('.ts') && !expectedFiles.has(file)) {
      unlinkSync(join(schemaApiDir, file))
    }
  }

  for (const ep of endpoints) {
    const content = generateEndpointFile(ep, hasTanstack)
    writeFileSync(join(schemaApiDir, `${ep.fileKey}.ts`), content, 'utf-8')
  }

  return endpoints
}
