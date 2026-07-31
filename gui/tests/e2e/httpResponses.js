export function canonicalErrorResponse({
  code,
  message,
  status,
  details = {},
}) {
  return {
    status,
    contentType: 'application/json',
    json: {
      error: {
        code,
        message,
        details,
      },
    },
  }
}

export function simulationNotFoundResponse() {
  return canonicalErrorResponse({
    code: 'NOT_FOUND',
    message: 'Simulation not found',
    status: 404,
    details: {
      resource: 'Simulation',
    },
  })
}
