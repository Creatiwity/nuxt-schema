import type { Nitro } from 'nitropack'
import type { Plugin } from 'rollup'
import { readFile } from 'node:fs/promises'
import { transformSync } from 'oxc-transform'

const virtualPrefix = '\0nitro-handler-schema:'

export function routeSchema(nitro: Nitro, importPath: string) {
  return {
    name: 'nitro:route-schema',
    async resolveId(id, importer, resolveOpts) {
      if (id.startsWith('\0') || id.startsWith('#internal')) {
        return
      }
      if (id.endsWith(`?meta`)) {
        const resolved = await this.resolve(
          id.replace(`?meta`, ``),
          importer,
          resolveOpts,
        )
        if (!resolved) {
          return
        }

        return virtualPrefix + resolved.id
      }
    },
    load(id) {
      if (id.startsWith(virtualPrefix)) {
        const fullPath = id.slice(virtualPrefix.length)
        return readFile(fullPath, { encoding: 'utf8' })
      }
    },
    async transform(code, id) {
      if (!id.startsWith(virtualPrefix)) {
        return
      }

      let newCode: string = 'export default {}'

      try {
        const jsCode = transformSync(id, code).code

        if (jsCode.includes('defineSchemaHandler')) {
          newCode = `import defineSchemaMetaProvider from '${importPath}';\r\n${jsCode}`
          newCode = newCode.replace('defineSchemaHandler', 'defineSchemaMetaProvider')
        }
      }
      catch (error) {
        nitro.logger.warn(
          `[handlers-schema] Cannot extra route schema for: ${id}: ${error}`,
        )
      }

      return {
        code: newCode,
        map: null,
      }
    },
  } satisfies Plugin
}
