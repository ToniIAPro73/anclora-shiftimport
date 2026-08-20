export function sendJson(res, statusCode, payload) {
  res.status(statusCode).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload));
}

export function handleError(res, error) {
  const status = error?.status ?? 500;
  if (status >= 500) {
    console.error('[api] error', error);
  }
  sendJson(res, status, { error: status >= 500 ? 'Unexpected API error' : error.message });
}
