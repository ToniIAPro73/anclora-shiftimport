/** Consume and immediately remove an invitation token from the address bar. */
export function consumeInvitationToken(location: Pick<Location, 'hash' | 'search' | 'pathname'> = window.location): string {
  const hashToken = new URLSearchParams(location.hash.replace(/^#/, '')).get('token');
  const legacyToken = new URLSearchParams(location.search).get('token');
  const token = hashToken ?? legacyToken ?? '';
  if (hashToken || legacyToken) {
    window.history.replaceState(window.history.state, '', location.pathname);
  }
  return token;
}
