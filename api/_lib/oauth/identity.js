async function findUserByOAuthIdentity(sql, provider, providerAccountId) {
  const rows = await sql`
    SELECT u.id, u.email, u.display_name
    FROM oauth_identities oi
    JOIN users u ON u.id = oi.user_id
    WHERE oi.provider = ${provider} AND oi.provider_account_id = ${providerAccountId}
  `;
  return rows[0] ?? null;
}

async function linkOAuthIdentity(sql, userId, identity) {
  await sql`
    INSERT INTO oauth_identities (user_id, provider, provider_account_id, email)
    VALUES (${userId}, ${identity.provider}, ${identity.providerAccountId}, ${identity.email})
  `;
}

/**
 * Resolves a verified external OAuth identity to a local user:
 * 1. Identity already linked -> return the linked user.
 * 2. No identity, but a user exists with the same email -> link to it.
 * 3. Neither -> register a new passwordless user and link the identity.
 *
 * The caller is responsible for creating the session afterwards.
 */
export async function loginWithExternalIdentity(sql, identity) {
  const email = identity.email.toLowerCase();

  const linkedUser = await findUserByOAuthIdentity(sql, identity.provider, identity.providerAccountId);
  if (linkedUser) {
    return linkedUser;
  }

  const existingRows = await sql`SELECT id, email, display_name FROM users WHERE lower(email) = ${email}`;
  const existingUser = existingRows[0];
  if (existingUser) {
    await linkOAuthIdentity(sql, existingUser.id, { ...identity, email });
    return existingUser;
  }

  const newUserRows = await sql`
    INSERT INTO users (email, password_hash, display_name)
    VALUES (${email}, NULL, ${identity.displayName})
    RETURNING id, email, display_name
  `;
  const newUser = newUserRows[0];
  await linkOAuthIdentity(sql, newUser.id, { ...identity, email });
  return newUser;
}
