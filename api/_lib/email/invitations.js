const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

// The recipient never needs to know their role, whether they're linked to
// an employee profile, or any other internal account-provisioning detail —
// this email is a plain "you're invited" message, not an admin readout.
export function buildInvitationEmail({
  appUrl,
  token,
  recipientName,
  organizationName,
  inviterName,
  locale = 'es',
  expiresAt,
}) {
  const language = locale === 'en' ? 'en' : 'es';
  const recipientFirstName = String(recipientName ?? '').trim().split(/\s+/)[0] || '';
  const safeRecipientFirstName = escapeHtml(recipientFirstName);
  const safeOrganization = escapeHtml(organizationName);
  const safeInviter = escapeHtml(inviterName || (language === 'en' ? 'Someone at your organization' : 'Alguien de tu organización'));
  // The token lives in the URL fragment so browsers, proxies, referrers and
  // analytics never receive it as an HTTP request target.
  const link = `${appUrl}/accept-invitation#token=${encodeURIComponent(token)}`;
  const safeLink = escapeHtml(link);
  const expiry = new Date(expiresAt).toLocaleDateString(language === 'en' ? 'en-GB' : 'es-ES');
  const safeExpiry = escapeHtml(expiry);

  // Solid gold fill, near-black text: the same brand CTA as the app and the
  // landing page (`.btn-gold`), expressed as inline styles because email
  // clients (Outlook desktop especially) don't reliably render gradients or
  // external stylesheets.
  const ctaButtonStyle = 'display:inline-block;padding:14px 32px;background-color:#f0ce62;color:#1b1f2f;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px';

  if (language === 'en') {
    const greeting = safeRecipientFirstName ? `Hi ${safeRecipientFirstName},` : 'Hi,';
    return {
      subject: `You have an invitation to join ${organizationName}`,
      text: [
        greeting,
        '',
        `${safeInviter} has invited you to join ${organizationName} on Anclora ShiftImport.`,
        '',
        'Accept the invitation to access your shifts and start using the app.',
        '',
        `Accept invitation: ${link}`,
        '',
        `This link is personal and will be available until ${expiry}.`,
        "If you weren't expecting this email, you can ignore it.",
      ].join('\n'),
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:520px;margin:auto">
<h1 style="font-size:18px">Anclora ShiftImport</h1>
<p>${greeting}</p>
<p><strong>${safeInviter}</strong> has invited you to join <strong>${safeOrganization}</strong> on Anclora ShiftImport.</p>
<p>Accept the invitation to access your shifts and start using the app.</p>
<p><a href="${safeLink}" style="${ctaButtonStyle}">Accept invitation</a></p>
<p style="color:#5b6472;font-size:13px">This link is personal and will be available until ${safeExpiry}.</p>
<p style="color:#5b6472;font-size:13px">If you weren't expecting this email, you can ignore it.</p>
</div>`,
    };
  }
  const greeting = safeRecipientFirstName ? `Hola ${safeRecipientFirstName},` : 'Hola,';
  return {
    subject: `Tienes una invitación para unirte a ${organizationName}`,
    text: [
      greeting,
      '',
      `${safeInviter} te ha invitado a unirte a ${organizationName} en Anclora ShiftImport.`,
      '',
      'Acepta la invitación para acceder a tus turnos y empezar a utilizar la aplicación.',
      '',
      `Aceptar invitación: ${link}`,
      '',
      `Este enlace es personal y estará disponible hasta el ${expiry}.`,
      'Si no esperabas este correo, puedes ignorarlo.',
    ].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:520px;margin:auto">
<h1 style="font-size:18px">Anclora ShiftImport</h1>
<p>${greeting}</p>
<p><strong>${safeInviter}</strong> te ha invitado a unirte a <strong>${safeOrganization}</strong> en Anclora ShiftImport.</p>
<p>Acepta la invitación para acceder a tus turnos y empezar a utilizar la aplicación.</p>
<p><a href="${safeLink}" style="${ctaButtonStyle}">Aceptar invitación</a></p>
<p style="color:#5b6472;font-size:13px">Este enlace es personal y estará disponible hasta el ${safeExpiry}.</p>
<p style="color:#5b6472;font-size:13px">Si no esperabas este correo, puedes ignorarlo.</p>
</div>`,
  };
}
