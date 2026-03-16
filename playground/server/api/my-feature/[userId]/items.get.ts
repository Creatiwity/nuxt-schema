import { myFeatureParams, myFeatureQuery, myFeatureResponse } from '#shared/schemas/my-feature'

export default defineSchemaHandler({
  description: 'Get items for a user',
  input: {
    params: myFeatureParams,
    query: myFeatureQuery,
  },
  output: myFeatureResponse,
}, ({ params, query }) => {
  return {
    status: 200 as const,
    data: {
      userId: params.userId,
      items: [`item-1`, `item-2`],
      limit: query.limit ?? 10,
    },
  }
})
