export function sendJson(res, statusCode, payload) {
  res.status(statusCode).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload));
}

export function handleError(res, error) {
  const status = error?.status ?? 500;
  if (status >= 500) {
    console.error('[api] error', error);
  }
  sendJson(res, status, {
    error: status >= 500 ? 'Unexpected API error' : error.message,
    // Machine-readable reason (e.g. 'PLAN_LIMIT') lets the frontend show the
    // upgrade UX instead of a generic error banner — never inferred from
    // the message string.
    ...(status < 500 && error?.code ? { code: error.code } : {}),
    ...(status < 500 && error?.conflictingAssignmentId
      ? { conflictingAssignmentId: error.conflictingAssignmentId } : {}),
    ...(status < 500 && Number.isFinite(error?.minimumRestHours)
      ? { minimumRestHours: error.minimumRestHours } : {}),
    ...(status < 500 && error?.draftVersionId
      ? { draftVersionId: error.draftVersionId } : {}),
  });
}
