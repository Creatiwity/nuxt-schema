import type { Nitro } from 'nitropack'
import type { Plugin } from 'rollup'
import { readFile } from 'node:fs/promises'
import { transformSync } from 'oxc-transform'

export const virtualPrefix = 'virtual:#nitro-handler-schema'

export function routeSchema(nitro: Nitro) {
  const { srcDir } = nitro.options

  return {
    name: 'nitro:route-schema',
    async resolveId(id, importer, resolveOpts) {
      if (!id.startsWith(srcDir) || !id.endsWith(`?meta`)) {
        return
      }

      const resolved = await this.resolve(
        id.replace(`?meta`, ``),
        importer,
        resolveOpts,
      )
      if (!resolved) {
        return
      }

      const relativePath = resolved.id.slice(srcDir.length)

      return virtualPrefix + relativePath
    },
    load(id) {
      if (id.startsWith(virtualPrefix)) {
        const fullPath = `${srcDir}${id.slice(virtualPrefix.length)}`
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
          newCode = jsCode.replaceAll('defineSchemaHandler', 'defineSchemaMetaProvider')
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
