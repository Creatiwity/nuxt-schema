export default defineSchemaHandler({
  input: {
    query,
  },
  output: response,
}, ({ query }) => {
  const mode = (() => {
    if (query.modes == null) {
      return 'HOME' as const
    }
    else if (Array.isArray(query.modes)) {
      return query.modes.at(0) ?? 'HOME' as const
    }
    else {
      return query.modes
    }
  })()

  return {
    status: 200,
    data: {
      mode,
    },
  }
}, {
  onValidationError(type, failureResult, event) {
    console.error(type, failureResult, event.path)
  },
})
