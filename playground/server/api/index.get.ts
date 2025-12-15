export default defineSchemaHandler({
  input: {
    query,
  },
  output: response,
}, ({ query }) => {
  const mode = query.modes?.at(0)

  return {
    status: 200,
    data: {
      mode: mode ?? 'HOME' as const,
    },
  }
}, {
  onValidationError(type, failureResult, event) {
    console.error(type, failureResult, event.path)
  },
})
