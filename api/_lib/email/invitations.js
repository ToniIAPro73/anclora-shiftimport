const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

// Human role labels for the invitation email — kept local to this module
// (not shared with the client's src/lib/i18n.ts) so this server-side email
// builder never depends on browser-only code in that file.
const ROLE_LABELS = {
  es: { OWNER: 'Propietario', ADMIN: 'Administrador', PLANNER: 'Planificador', EMPLOYEE: 'Empleado' },
  en: { OWNER: 'Owner', ADMIN: 'Admin', PLANNER: 'Planner', EMPLOYEE: 'Employee' },
};

function localizedRole(role, language) {
  return ROLE_LABELS[language][String(role ?? '').toUpperCase()] ?? String(role ?? '');
}

export function buildInvitationEmail({
  appUrl,
  token,
  recipientName,
  organizationName,
  inviterName,
  role,
  employeeName,
  locale = 'es',
  expiresAt,
}) {
  const language = locale === 'en' ? 'en' : 'es';
  const safeRecipient = escapeHtml(String(recipientName ?? '').trim());
  const safeOrganization = escapeHtml(organizationName);
  const safeInviter = escapeHtml(inviterName || (language === 'en' ? 'Someone at your organization' : 'Alguien de tu organización'));
  const safeRoleLabel = escapeHtml(localizedRole(role, language));
  const safeEmployeeName = String(employeeName ?? '').trim() ? escapeHtml(String(employeeName).trim()) : null;
  // The token lives in the URL fragment so browsers, proxies, referrers and
  // analytics never receive it as an HTTP request target.
  const link = `${appUrl}/accept-invitation#token=${encodeURIComponent(token)}`;
  const expiry = new Date(expiresAt).toLocaleDateString(language === 'en' ? 'en-GB' : 'es-ES');
  const safeLink = escapeHtml(link);

  if (language === 'en') {
    const greeting = safeRecipient ? `Hi ${safeRecipient},` : 'Hi,';
    const employeeLine = safeEmployeeName ? `Your access will be linked to ${safeEmployeeName}'s profile.` : null;
    return {
      subject: `You've been invited to join ${organizationName} on Anclora ShiftImport`,
      text: [
        greeting,
        '',
        `${safeInviter} has invited you to be part of ${organizationName} on Anclora ShiftImport.`,
        '',
        'Once you accept, you will be able to access your shifts and the features assigned to your profile.',
        '',
        `Access type: ${safeRoleLabel}`,
        ...(employeeLine ? [employeeLine] : []),
        '',
        `Accept invitation: ${link}`,
        '',
        `This invitation will be available until ${expiry}.`,
        '',
        "If you weren't expecting this invitation, you can ignore this message. Your account will not be affected.",
        '',
        'Anclora ShiftImport',
      ].join('\n'),
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:560px;margin:auto">
<h1 style="font-size:18px">Anclora ShiftImport</h1>
<p>${greeting}</p>
<p><strong>${safeInviter}</strong> has invited you to be part of <strong>${safeOrganization}</strong> on Anclora ShiftImport.</p>
<p>Once you accept, you will be able to access your shifts and the features assigned to your profile.</p>
<p>Access type: <strong>${safeRoleLabel}</strong></p>
${employeeLine ? `<p>${employeeLine}</p>` : ''}
<p><a href="${safeLink}" style="display:inline-block;padding:12px 20px;background:#172033;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Accept invitation</a></p>
<p style="color:#5b6472;font-size:13px">This invitation will be available until ${escapeHtml(expiry)}.</p>
<p style="color:#5b6472;font-size:13px">If you weren't expecting this invitation, you can ignore this message. Your account will not be affected.</p>
</div>`,
    };
  }
  const greeting = safeRecipient ? `Hola ${safeRecipient},` : 'Hola,';
  const employeeLine = safeEmployeeName ? `Tu acceso quedará vinculado al perfil de ${safeEmployeeName}.` : null;
  return {
    subject: `Te han invitado a unirte a ${organizationName} en Anclora ShiftImport`,
    text: [
      greeting,
      '',
      `${safeInviter} te ha invitado a formar parte de ${organizationName} en Anclora ShiftImport.`,
      '',
      'Al aceptar la invitación podrás acceder a tus turnos y a las funciones asignadas a tu perfil.',
      '',
      `Tipo de acceso: ${safeRoleLabel}`,
      ...(employeeLine ? [employeeLine] : []),
      '',
      `Aceptar invitación: ${link}`,
      '',
      `Esta invitación estará disponible hasta el ${expiry}.`,
      '',
      'Si no esperabas esta invitación, puedes ignorar este mensaje. Tu cuenta no sufrirá ningún cambio.',
      '',
      'Anclora ShiftImport',
    ].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:560px;margin:auto">
<h1 style="font-size:18px">Anclora ShiftImport</h1>
<p>${greeting}</p>
<p><strong>${safeInviter}</strong> te ha invitado a formar parte de <strong>${safeOrganization}</strong> en Anclora ShiftImport.</p>
<p>Al aceptar la invitación podrás acceder a tus turnos y a las funciones asignadas a tu perfil.</p>
<p>Tipo de acceso: <strong>${safeRoleLabel}</strong></p>
${employeeLine ? `<p>${employeeLine}</p>` : ''}
<p><a href="${safeLink}" style="display:inline-block;padding:12px 20px;background:#172033;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Aceptar invitación</a></p>
<p style="color:#5b6472;font-size:13px">Esta invitación estará disponible hasta el ${escapeHtml(expiry)}.</p>
<p style="color:#5b6472;font-size:13px">Si no esperabas esta invitación, puedes ignorar este mensaje. Tu cuenta no sufrirá ningún cambio.</p>
</div>`,
  };
}
