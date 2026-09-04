import { HttpError, requireRole } from './auth.js';

/**
 * Server-authoritative FormatProfile data access (Format Memory v1).
 *
 * This is a deliberate, independent re-implementation of the allowlist +
 * PII-heuristic validation that also exists client-side in
 * src/lib/format-profiles.ts (sanitizeFormatProfileForPersistence). The API
 * must never trust a client-side pass of that validation — see
 * sdd/features/format-memory-v1/02_DATA_API_CONTRACT.md.
 *
 * Tenant isolation: every query filters organization_id = ctx.organizationId
 * (never client-supplied). A profile id belonging to another org resolves as
 * 404 (no existence leak), matching the areas/employees convention.
 */

const MAX_DISPLAY_NAME = 80;
const MAX_ALIAS_ENTRIES = 60;
const MAX_ALIAS_LEN = 40;
const MAX_OFF_TOKENS = 60;
const MAX_OFF_TOKEN_LEN = 20;
const MAX_DAY_COLUMN_ENTRIES = 31;
const MAX_EMPLOYEE_ROW_INDEX = 9999;
const MAX_BODY_BYTES = 32 * 1024;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LONG_DIGIT_RUN = /\d{5,}/;
const NAME_SHAPED = /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ'-]+)(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ'-]+)+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikePii(text) {
  if (EMAIL_PATTERN.test(text)) return 'looks like an email address';
  if (LONG_DIGIT_RUN.test(text)) return 'looks like an external/payroll id';
  if (NAME_SHAPED.test(text.trim())) return 'looks like a person name';
  return null;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Allowlist-only, fail-closed sanitizer. Any field outside the known shape,
 * or any PII-shaped value, rejects the WHOLE payload — never a partial
 * accept. Returns { ok, value, reason } — reason is a short, non-specific
 * string (never echoes the rejected raw value back to the client).
 */
export function sanitizeCandidateInput(input) {
  if (JSON.stringify(input ?? {}).length > MAX_BODY_BYTES) {
    return { ok: false, reason: 'payload too large' };
  }
  if (!isPlainObject(input)) {
    return { ok: false, reason: 'payload must be an object' };
  }

  const allowedKeys = new Set([
    'displayName', 'sourceType', 'signature', 'tokenAliases', 'codeTimes',
    'offTokens', 'employeeRowStrategy', 'employeeRowIndex', 'dayColumnMap',
    'tabularMemory', 'parserConfig', 'supersedesLogicalProfileId',
  ]);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, reason: `unknown field "${key}"` };
    }
  }

  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  if (!displayName) return { ok: false, reason: 'displayName is required' };
  if (displayName.length > MAX_DISPLAY_NAME) return { ok: false, reason: 'displayName too long' };
  const nameReason = looksLikePii(displayName);
  if (nameReason) return { ok: false, reason: `displayName ${nameReason}` };

  const sourceType = input.sourceType === 'pdf' || input.sourceType === 'tabular' ? input.sourceType : null;
  if (!sourceType) return { ok: false, reason: 'sourceType must be "pdf" or "tabular"' };

  const signature = input.signature;
  if (!isPlainObject(signature)
    || typeof signature.documentType !== 'string'
    || typeof signature.structureHash !== 'string'
    || !signature.structureHash
    || signature.structureHash.length > 64
    || typeof signature.dayHeaderCount !== 'number'
    || typeof signature.columnCount !== 'number'
    || typeof signature.hasLegend !== 'boolean') {
    return { ok: false, reason: 'invalid signature' };
  }

  const tokenAliases = {};
  if (input.tokenAliases !== undefined) {
    if (!isPlainObject(input.tokenAliases)) return { ok: false, reason: 'tokenAliases must be an object' };
    const entries = Object.entries(input.tokenAliases);
    if (entries.length > MAX_ALIAS_ENTRIES) return { ok: false, reason: 'too many tokenAliases' };
    for (const [token, typeId] of entries) {
      if (typeof typeId !== 'string') return { ok: false, reason: 'tokenAliases value must be a string' };
      if (token.length > MAX_ALIAS_LEN || typeId.length > MAX_ALIAS_LEN) {
        return { ok: false, reason: 'tokenAliases entry too long' };
      }
      const reason = looksLikePii(token) || looksLikePii(typeId);
      if (reason) return { ok: false, reason: `tokenAliases entry ${reason}` };
      tokenAliases[token] = typeId;
    }
  }

  const codeTimes = {};
  if (input.codeTimes !== undefined) {
    if (!isPlainObject(input.codeTimes)) return { ok: false, reason: 'codeTimes must be an object' };
    const entries = Object.entries(input.codeTimes);
    if (entries.length > MAX_ALIAS_ENTRIES) return { ok: false, reason: 'too many codeTimes' };
    for (const [token, value] of entries) {
      const startTime = typeof value?.startTime === 'string' ? value.startTime : '';
      const endTime = typeof value?.endTime === 'string' ? value.endTime : '';
      if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
        return { ok: false, reason: `codeTimes entry "${token}" has an invalid time` };
      }
      const reason = looksLikePii(token);
      if (reason) return { ok: false, reason: `codeTimes entry ${reason}` };
      codeTimes[token] = { startTime, endTime };
    }
  }

  const offTokens = [];
  if (input.offTokens !== undefined) {
    if (!Array.isArray(input.offTokens)) return { ok: false, reason: 'offTokens must be an array' };
    if (input.offTokens.length > MAX_OFF_TOKENS) return { ok: false, reason: 'too many offTokens' };
    for (const raw of input.offTokens) {
      const token = String(raw).trim();
      if (token.length > MAX_OFF_TOKEN_LEN) return { ok: false, reason: 'offTokens entry too long' };
      const reason = looksLikePii(token);
      if (reason) return { ok: false, reason: `offTokens entry ${reason}` };
      offTokens.push(token);
    }
  }

  const employeeRowStrategy = ['identifier', 'name', 'manual-row'].includes(input.employeeRowStrategy)
    ? input.employeeRowStrategy
    : null;
  if (!employeeRowStrategy) return { ok: false, reason: 'invalid employeeRowStrategy' };

  let employeeRowIndex = null;
  if (input.employeeRowIndex !== undefined && input.employeeRowIndex !== null) {
    if (!Number.isInteger(input.employeeRowIndex) || input.employeeRowIndex < 0
      || input.employeeRowIndex > MAX_EMPLOYEE_ROW_INDEX) {
      return { ok: false, reason: 'invalid employeeRowIndex' };
    }
    employeeRowIndex = input.employeeRowIndex;
  }

  let dayColumnMap = null;
  if (input.dayColumnMap !== undefined && input.dayColumnMap !== null) {
    if (!isPlainObject(input.dayColumnMap)) return { ok: false, reason: 'dayColumnMap must be an object' };
    const entries = Object.entries(input.dayColumnMap);
    if (entries.length > MAX_DAY_COLUMN_ENTRIES) return { ok: false, reason: 'too many dayColumnMap entries' };
    const normalized = {};
    for (const [col, day] of entries) {
      const colNum = Number(col);
      const dayNum = Number(day);
      if (!Number.isInteger(colNum) || colNum < 0 || !Number.isInteger(dayNum) || dayNum < 1) {
        return { ok: false, reason: 'invalid dayColumnMap entry' };
      }
      normalized[colNum] = dayNum;
    }
    dayColumnMap = normalized;
  }

  let tabularMemory = null;
  if (input.tabularMemory !== undefined && input.tabularMemory !== null) {
    if (!isPlainObject(input.tabularMemory)) return { ok: false, reason: 'tabularMemory must be an object' };
    const dateColumnIndex = typeof input.tabularMemory.dateColumnIndex === 'number'
      ? input.tabularMemory.dateColumnIndex : null;
    const employeeColumnIndex = typeof input.tabularMemory.employeeColumnIndex === 'number'
      ? input.tabularMemory.employeeColumnIndex : null;
    const valueColumnIndices = Array.isArray(input.tabularMemory.valueColumnIndices)
      ? input.tabularMemory.valueColumnIndices.filter((i) => Number.isInteger(i) && i >= 0)
      : [];
    tabularMemory = { dateColumnIndex, employeeColumnIndex, valueColumnIndices };
  }

  let parserConfig = { clusterTolerance: 0, columnMatchMaxDistance: 0 };
  if (input.parserConfig !== undefined) {
    if (!isPlainObject(input.parserConfig)
      || typeof input.parserConfig.clusterTolerance !== 'number'
      || typeof input.parserConfig.columnMatchMaxDistance !== 'number') {
      return { ok: false, reason: 'invalid parserConfig' };
    }
    parserConfig = {
      clusterTolerance: input.parserConfig.clusterTolerance,
      columnMatchMaxDistance: input.parserConfig.columnMatchMaxDistance,
    };
  }

  let supersedesLogicalProfileId;
  if (input.supersedesLogicalProfileId !== undefined) {
    if (typeof input.supersedesLogicalProfileId !== 'string' || !UUID_PATTERN.test(input.supersedesLogicalProfileId)) {
      return { ok: false, reason: 'supersedesLogicalProfileId must be a UUID' };
    }
    supersedesLogicalProfileId = input.supersedesLogicalProfileId;
  }

  return {
    ok: true,
    value: {
      displayName, sourceType, signature, tokenAliases, codeTimes, offTokens,
      employeeRowStrategy, employeeRowIndex, dayColumnMap, tabularMemory, parserConfig,
      ...(supersedesLogicalProfileId ? { supersedesLogicalProfileId } : {}),
    },
  };
}

function mapProfileRow(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    logicalProfileId: row.logical_profile_id,
    version: row.version,
    status: row.status,
    signature: row.signature,
    sourceType: row.source_type,
    displayName: row.display_name,
    parserConfig: row.parser_config,
    tokenAliases: row.token_aliases,
    codeTimes: row.code_times,
    offTokens: row.off_tokens,
    employeeRowStrategy: row.employee_row_strategy,
    employeeRowIndex: row.employee_row_index,
    dayColumnMap: row.day_column_map,
    tabularMemory: row.tabular_memory,
    useCount: row.use_count,
    successfulUseCount: row.successful_use_count,
    lastUsedAt: row.last_used_at,
    createdByUserId: row.created_by_user_id,
    supersedesProfileId: row.supersedes_profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listFormatProfiles(sql, ctx, { logicalProfileId = null, status = null } = {}) {
  const rows = await sql`
    SELECT * FROM format_profiles
    WHERE organization_id = ${ctx.organizationId}
      AND (${logicalProfileId}::uuid IS NULL OR logical_profile_id = ${logicalProfileId})
      AND (${status}::text IS NULL OR status = ${status})
    ORDER BY logical_profile_id ASC, version DESC
  `;
  return rows.map(mapProfileRow);
}

export async function getFormatProfile(sql, ctx, id) {
  const rows = await sql`
    SELECT * FROM format_profiles
    WHERE id = ${id} AND organization_id = ${ctx.organizationId}
  `;
  if (rows.length === 0) {
    throw new HttpError(404, 'Format profile not found');
  }
  return mapProfileRow(rows[0]);
}

/**
 * Creates a candidate profile. Idempotent on (organization_id,
 * logical_profile_id, structureHash) for non-deprecated rows: an identical
 * repeat returns the existing row instead of inserting a duplicate.
 */
export async function createCandidateFormatProfile(sql, ctx, input) {
  const sanitized = sanitizeCandidateInput(input);
  if (!sanitized.ok) {
    const error = new HttpError(400, `Invalid format profile payload: ${sanitized.reason}`);
    error.code = 'INVALID_PROFILE_PAYLOAD';
    throw error;
  }
  const value = sanitized.value;

  let logicalProfileId = null;
  let version = 1;
  let supersedesProfileId = null;

  if (value.supersedesLogicalProfileId) {
    const family = await sql`
      SELECT id, version, status FROM format_profiles
      WHERE organization_id = ${ctx.organizationId}
        AND logical_profile_id = ${value.supersedesLogicalProfileId}
      ORDER BY version DESC
      LIMIT 1
    `;
    if (family.length === 0) {
      throw new HttpError(404, 'Format profile not found');
    }
    logicalProfileId = value.supersedesLogicalProfileId;
    version = family[0].version + 1;
    supersedesProfileId = family[0].id;

    const existingIdentical = await sql`
      SELECT * FROM format_profiles
      WHERE organization_id = ${ctx.organizationId}
        AND logical_profile_id = ${logicalProfileId}
        AND status != 'deprecated'
        AND signature->>'structureHash' = ${value.signature.structureHash}
    `;
    if (existingIdentical.length > 0) {
      return { profile: mapProfileRow(existingIdentical[0]), created: false };
    }
  } else {
    const existingIdentical = await sql`
      SELECT * FROM format_profiles
      WHERE organization_id = ${ctx.organizationId}
        AND status != 'deprecated'
        AND signature->>'structureHash' = ${value.signature.structureHash}
    `;
    if (existingIdentical.length > 0) {
      return { profile: mapProfileRow(existingIdentical[0]), created: false };
    }
    logicalProfileId = crypto.randomUUID();
  }

  try {
    const rows = await sql`
      INSERT INTO format_profiles (
        organization_id, logical_profile_id, version, status, signature, source_type,
        display_name, parser_config, token_aliases, code_times, off_tokens,
        employee_row_strategy, employee_row_index, day_column_map, tabular_memory,
        created_by_user_id, supersedes_profile_id
      ) VALUES (
        ${ctx.organizationId}, ${logicalProfileId}, ${version}, 'candidate',
        ${JSON.stringify(value.signature)}::jsonb, ${value.sourceType}, ${value.displayName},
        ${JSON.stringify(value.parserConfig)}::jsonb, ${JSON.stringify(value.tokenAliases)}::jsonb,
        ${JSON.stringify(value.codeTimes)}::jsonb, ${JSON.stringify(value.offTokens)}::jsonb,
        ${value.employeeRowStrategy}, ${value.employeeRowIndex}, ${value.dayColumnMap ? JSON.stringify(value.dayColumnMap) : null}::jsonb,
        ${value.tabularMemory ? JSON.stringify(value.tabularMemory) : null}::jsonb,
        ${ctx.user.id}, ${supersedesProfileId}
      )
      RETURNING *
    `;
    return { profile: mapProfileRow(rows[0]), created: true };
  } catch (error) {
    // format_profiles_org_structurehash_active_idx (migration 0012): two
    // concurrent saves of the identical (organization_id, structureHash)
    // both passed the existingIdentical SELECT above before either INSERT
    // committed. The database is the tiebreaker — whichever request lost
    // the race reuses the winner's row instead of surfacing a raw 500.
    if (error?.code === '23505') {
      const winner = await sql`
        SELECT * FROM format_profiles
        WHERE organization_id = ${ctx.organizationId}
          AND status != 'deprecated'
          AND signature->>'structureHash' = ${value.signature.structureHash}
      `;
      if (winner.length > 0) {
        return { profile: mapProfileRow(winner[0]), created: false };
      }
    }
    throw error;
  }
}

export async function renameFormatProfile(sql, ctx, id, displayName, updatedAt) {
  requireRole(ctx, 'ADMIN');
  const trimmed = String(displayName ?? '').trim();
  if (!trimmed || trimmed.length > MAX_DISPLAY_NAME) {
    throw new HttpError(400, 'Invalid displayName');
  }
  const reason = looksLikePii(trimmed);
  if (reason) {
    const error = new HttpError(400, `Invalid displayName: ${reason}`);
    error.code = 'INVALID_PROFILE_PAYLOAD';
    throw error;
  }
  const rows = await sql`
    UPDATE format_profiles SET display_name = ${trimmed}, updated_at = NOW()
    WHERE id = ${id} AND organization_id = ${ctx.organizationId}
      AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ${updatedAt}::timestamptz)
    RETURNING *
  `;
  if (rows.length === 0) {
    await assertExistsForConflict(sql, ctx, id);
    throw conflictError();
  }
  return mapProfileRow(rows[0]);
}

export async function recordFormatProfileUse(sql, ctx, id, outcome) {
  if (outcome !== 'success' && outcome !== 'failure') {
    throw new HttpError(400, 'outcome must be "success" or "failure"');
  }
  const rows = await sql`
    UPDATE format_profiles
    SET use_count = use_count + 1,
        successful_use_count = successful_use_count + CASE WHEN ${outcome} = 'success' THEN 1 ELSE 0 END,
        last_used_at = NOW()
    WHERE id = ${id} AND organization_id = ${ctx.organizationId}
    RETURNING *
  `;
  if (rows.length === 0) {
    throw new HttpError(404, 'Format profile not found');
  }
  return mapProfileRow(rows[0]);
}

async function assertExistsForConflict(sql, ctx, id) {
  const rows = await sql`
    SELECT id FROM format_profiles WHERE id = ${id} AND organization_id = ${ctx.organizationId}
  `;
  if (rows.length === 0) {
    throw new HttpError(404, 'Format profile not found');
  }
}

function conflictError() {
  const error = new HttpError(409, 'Format profile was modified concurrently');
  error.code = 'PROFILE_CONFLICT';
  return error;
}

export async function confirmFormatProfile(sql, ctx, id, updatedAt) {
  requireRole(ctx, 'ADMIN');
  const rows = await sql`
    UPDATE format_profiles SET status = 'validated', updated_at = NOW()
    WHERE id = ${id} AND organization_id = ${ctx.organizationId}
      AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ${updatedAt}::timestamptz)
      AND status = 'candidate'
    RETURNING *
  `;
  if (rows.length === 0) {
    await assertExistsForConflict(sql, ctx, id);
    throw conflictError();
  }
  const confirmed = mapProfileRow(rows[0]);

  if (confirmed.supersedesProfileId) {
    await sql`
      UPDATE format_profiles SET status = 'legacy', updated_at = NOW()
      WHERE organization_id = ${ctx.organizationId}
        AND logical_profile_id = ${confirmed.logicalProfileId}
        AND id != ${confirmed.id}
        AND status IN ('validated', 'verified', 'candidate')
    `;
  }
  return confirmed;
}

export async function deprecateFormatProfile(sql, ctx, id, updatedAt) {
  requireRole(ctx, 'ADMIN');
  const rows = await sql`
    UPDATE format_profiles SET status = 'deprecated', updated_at = NOW()
    WHERE id = ${id} AND organization_id = ${ctx.organizationId}
      AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ${updatedAt}::timestamptz)
    RETURNING *
  `;
  if (rows.length === 0) {
    const existing = await sql`
      SELECT * FROM format_profiles WHERE id = ${id} AND organization_id = ${ctx.organizationId}
    `;
    if (existing.length === 0) {
      throw new HttpError(404, 'Format profile not found');
    }
    if (existing[0].status === 'deprecated') {
      return mapProfileRow(existing[0]);
    }
    throw conflictError();
  }
  return mapProfileRow(rows[0]);
}

export async function reactivateFormatProfile(sql, ctx, id, updatedAt) {
  requireRole(ctx, 'ADMIN');
  const rows = await sql`
    UPDATE format_profiles SET status = 'validated', updated_at = NOW()
    WHERE id = ${id} AND organization_id = ${ctx.organizationId}
      AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ${updatedAt}::timestamptz)
      AND status IN ('legacy', 'deprecated')
    RETURNING *
  `;
  if (rows.length === 0) {
    await assertExistsForConflict(sql, ctx, id);
    throw conflictError();
  }
  return mapProfileRow(rows[0]);
}
