/**
 * Unified approval feed (spec §4.3.1): `GET /api/approval-requests?kind=SHIFT_CHANGE|TIME_OFF|ALL&status=PENDING|HISTORY`.
 *
 * This module only adds the SHIFT_CHANGE side and the merge. The visibility rules for shift changes are EXACTLY the legacy ones
 * (`api/approval-requests/index.js`: role, organisation policy, area mapping, no own requests) — D-01/V-07 is not touched here —
 * applied to both PENDING and HISTORY. HISTORY = the change request is APPROVED, REJECTED or CANCELLED. PENDING requires the change
 * request itself to be pending too: a cancelled request keeps its envelope PENDING in the legacy tables and must not read as pending here.
 *
 * Ordering is deterministic across kinds: newest first by the instant that defines the feed (creation for PENDING, resolution for
 * HISTORY), then by envelope id. The same `(instant, id)` keyset cursor pages every kind, so `ALL` merges two ordered streams.
 */
const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null));

function mapShiftChangeRow(row) {
  return {
    kind: 'SHIFT_CHANGE',
    id: row.id,
    organizationId: row.organization_id,
    changeRequestId: row.change_request_id,
    status: row.status,
    policySnapshot: row.policy_snapshot,
    createdAt: iso(row.created_at),
    requestType: row.request_type,
    reason: row.reason,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    areaId: row.area_id ?? null,
    areaName: row.area_name ?? null,
    shiftId: row.shift_id,
    shiftDate: row.shift_date,
    shiftStartTime: row.shift_start_time,
    shiftEndTime: row.shift_end_time,
    shiftLocation: row.shift_location ?? '',
    resolvedAt: iso(row.resolved_at),
    resolvedByName: row.resolved_by_name ?? null,
    rejectionReason: row.rejection_reason ?? null,
    sortAt: iso(row.sort_at),
  };
}

/** SHIFT_CHANGE items visible to the approver, PENDING or HISTORY, one keyset page (`limit` items + `hasMore`). */
export async function listShiftChangeApprovals(sql, ctx, { status, limit, areaId, employeeId, q, cursor }) {
  const history = status === 'HISTORY';
  const pattern = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  const rows = await sql`
    SELECT * FROM (
      SELECT ar.id, ar.organization_id, ar.change_request_id,
             CASE WHEN ${history} THEN cr.status ELSE ar.status END AS status,
             ar.policy_snapshot, ar.created_at,
             cr.request_type, cr.reason, cr.employee_id, cr.shift_id,
             cr.resolved_at, resolver.display_name AS resolved_by_name, ar.rejection_reason,
             e.name AS employee_name, e.area_id,
             a.name AS area_name,
             TO_CHAR(s.date, 'YYYY-MM-DD') AS shift_date,
             s.start_time AS shift_start_time,
             s.end_time AS shift_end_time,
             s.location AS shift_location,
             CASE WHEN ${history} THEN COALESCE(cr.resolved_at, ar.approved_at, ar.rejected_at, ar.created_at) ELSE ar.created_at END AS sort_at
      FROM approval_requests ar
      JOIN change_requests cr
        ON cr.id = ar.change_request_id
       AND cr.organization_id = ar.organization_id
      JOIN employees e
        ON e.id = cr.employee_id
       AND e.organization_id = ar.organization_id
      JOIN shifts s
        ON s.id = cr.shift_id
       AND s.employee_id = cr.employee_id
       AND s.organization_id = ar.organization_id
      LEFT JOIN areas a
        ON a.id = e.area_id
       AND a.organization_id = ar.organization_id
      LEFT JOIN users resolver ON resolver.id = cr.resolved_by_user_id
      JOIN organizations o ON o.id = ar.organization_id
      JOIN memberships caller_membership
        ON caller_membership.organization_id = ar.organization_id
       AND caller_membership.user_id = ${ctx.user.id}
      WHERE ar.organization_id = ${ctx.organizationId}
        AND (
          (${history} = FALSE AND ar.status = 'PENDING' AND cr.status = 'PENDING')
          OR (${history} = TRUE AND cr.status IN ('APPROVED', 'REJECTED', 'CANCELLED'))
        )
        AND (e.user_id IS NULL OR e.user_id <> ${ctx.user.id})
        AND (${ctx.employeeId || null}::uuid IS NULL OR cr.employee_id <> ${ctx.employeeId || null}::uuid)
        AND (${areaId}::uuid IS NULL OR e.area_id = ${areaId}::uuid)
        AND (${employeeId}::uuid IS NULL OR cr.employee_id = ${employeeId}::uuid)
        AND (${pattern}::text IS NULL OR e.name ILIKE ${pattern}::text ESCAPE '\\')
        AND (
          caller_membership.role = 'OWNER'
          OR (
            caller_membership.role = 'ADMIN'
            AND (
              o.approval_policy IN ('ORGANIZATION_ADMIN', 'NO_APPROVAL')
              OR (
                o.approval_policy = 'AREA_RESPONSIBLE'
                AND (
                  EXISTS (
                    SELECT 1
                    FROM area_responsibles arx
                    WHERE arx.area_id = e.area_id
                      AND arx.user_id = caller_membership.user_id
                      AND arx.organization_id = ar.organization_id
                  )
                  OR NOT EXISTS (
                    SELECT 1
                    FROM area_responsibles arx
                    WHERE arx.area_id = e.area_id
                      AND arx.organization_id = ar.organization_id
                  )
                  OR e.area_id IS NULL
                )
              )
            )
          )
          OR (
            caller_membership.role = 'PLANNER'
            AND (
              caller_membership.scoped_area_id IS NULL
              OR (e.area_id IS NOT NULL AND caller_membership.scoped_area_id = e.area_id)
            )
          )
        )
    ) feed
    WHERE (${cursor?.at ?? null}::timestamptz IS NULL OR (feed.sort_at, feed.id) < (${cursor?.at ?? null}::timestamptz, ${cursor?.id ?? null}::uuid))
    ORDER BY feed.sort_at DESC, feed.id DESC
    LIMIT ${limit + 1}
  `;
  return { requests: rows.slice(0, limit).map(mapShiftChangeRow), hasMore: rows.length > limit };
}

/**
 * Merge already ordered feeds into one page: newest first by `sortAt`, ties by id (deterministic, kind-independent).
 * `hasMore` is true if any feed has more or the merge itself overflowed `limit`; the caller turns the last item into the cursor.
 */
export function mergeApprovalFeeds(feeds, limit) {
  const merged = feeds
    .flatMap((feed) => feed.requests)
    .sort((a, b) => String(b.sortAt).localeCompare(String(a.sortAt)) || String(b.id).localeCompare(String(a.id)));
  const requests = merged.slice(0, limit);
  const hasMore = merged.length > limit || feeds.some((feed) => feed.hasMore);
  return { requests, hasMore };
}
