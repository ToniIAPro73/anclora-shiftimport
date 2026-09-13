const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export function buildInvitationEmail({
  appUrl,
  token,
  recipientName,
  organizationName,
  inviterName,
  role,
  locale = 'es',
  expiresAt,
}) {
  const language = locale === 'en' ? 'en' : 'es';
  const safeRecipient = escapeHtml(recipientName || (language === 'en' ? 'there' : 'ahí'));
  const safeOrganization = escapeHtml(organizationName);
  const safeInviter = escapeHtml(inviterName || (language === 'en' ? 'your organization' : 'tu organización'));
  const safeRole = escapeHtml(role);
  // The token lives in the URL fragment so browsers, proxies, referrers and
  // analytics never receive it as an HTTP request target.
  const link = `${appUrl}/accept-invitation#token=${encodeURIComponent(token)}`;
  const expiry = new Date(expiresAt).toLocaleDateString(language === 'en' ? 'en-GB' : 'es-ES');

  if (language === 'en') {
    return {
      subject: `Invitation to join ${organizationName}`,
      text: `Hello ${recipientName || 'there'},\n\n${inviterName || 'Your organization'} invited you to join ${organizationName} as ${role}.\n\nAccept the invitation: ${link}\n\nThis link expires on ${expiry}. If you did not request this, you can ignore this email.\n\nAnclora ShiftImport`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033;max-width:560px;margin:auto"><h1>Anclora ShiftImport</h1><p>Hello ${safeRecipient},</p><p><strong>${safeInviter}</strong> invited you to join <strong>${safeOrganization}</strong> as <strong>${safeRole}</strong>.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;background:#172033;color:#fff;text-decoration:none;border-radius:8px">Accept invitation</a></p><p>This link expires on ${escapeHtml(expiry)}. If you did not request this, you can ignore this email.</p></div>`,
    };
  }
  return {
    subject: `Invitación para unirte a ${organizationName}`,
    text: `Hola ${recipientName || 'ahí'},\n\n${inviterName || 'Tu organización'} te ha invitado a unirte a ${organizationName} como ${role}.\n\nAceptar la invitación: ${link}\n\nEste enlace caduca el ${expiry}. Si no lo has solicitado, puedes ignorar este mensaje.\n\nAnclora ShiftImport`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033;max-width:560px;margin:auto"><h1>Anclora ShiftImport</h1><p>Hola ${safeRecipient},</p><p><strong>${safeInviter}</strong> te ha invitado a unirte a <strong>${safeOrganization}</strong> como <strong>${safeRole}</strong>.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;background:#172033;color:#fff;text-decoration:none;border-radius:8px">Aceptar invitación</a></p><p>Este enlace caduca el ${escapeHtml(expiry)}. Si no lo has solicitado, puedes ignorar este mensaje.</p></div>`,
  };
}
