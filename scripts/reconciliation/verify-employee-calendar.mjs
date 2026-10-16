#!/usr/bin/env node
/**
 * Read-only verification of an employee's effective calendar after a
 * reconciliation run: day-level results, monthly/yearly effective totals and
 * the double-counting invariant. DATABASE_URL comes from the environment.
 *
 *   DATABASE_URL=... node scripts/reconciliation/verify-employee-calendar.mjs \
 *     --organization=ShiftImport --employee-external-id=84881 --year=2026 \
 *     [--dates=2026-01-01,2026-02-06] [--today=2026-10-16]
 */
import pg from 'pg';
import { computeEffectiveStats, formatClock, resolveDay } from '../../src/lib/effective-calendar.js';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, ...v] = a.slice(2).split('=');
  return [k, v.join('=') || true];
}));
const url = new URL(process.env.DATABASE_URL);
const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
const client = new pg.Client({
  host: url.hostname, port: Number(url.port || 5432), user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password), database: url.pathname.slice(1),
  ssl: local ? false : { rejectUnauthorized: false }, options: '-c default_transaction_read_only=on',
});
const hm = (minutes) => `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;

await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const employee = (await client.query(
    `SELECT e.id FROM employees e JOIN organizations o ON o.id = e.organization_id
      WHERE o.name = $1 AND e.external_employee_id = $2`, [args.organization, args['employee-external-id']])).rows;
  if (employee.length !== 1) throw new Error('employee not found');
  const year = Number(args.year);
  const rows = (await client.query(
    `SELECT id, TO_CHAR(date,'YYYY-MM-DD') AS date, start_time, end_time, shift_type, location, counts_as_work,
            layer, provenance, legacy_origin, duty_role, effective_state, plan_revision
       FROM shifts WHERE employee_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date, start_time NULLS FIRST`,
    [employee[0].id, `${year}-01-01`, `${year}-12-31`])).rows;
  await client.query('ROLLBACK');

  const today = args.today ?? new Date().toISOString().slice(0, 10);
  for (const date of String(args.dates ?? '').split(',').filter(Boolean)) {
    const day = resolveDay(date, rows.filter((r) => r.date === date));
    const eff = [...day.workIntervals, ...day.absenceIntervals].map((i) => `${i.type} ${formatClock(i.start)}-${formatClock(i.end)}`).join(' + ') || day.fullDayType || '-';
    console.log(`${date} status=${day.status} effective=[${eff}] total=${hm(day.minutes.work)} regular=${hm(day.minutes.regular)} extras=${hm(day.minutes.extras)} jtRows=${day.legacyDutyRows} issues=${day.issues.filter((i) => i.blocking).map((i) => i.code).join(',') || '-'}`);
  }

  const stats = computeEffectiveStats(rows, { from: `${year}-01-01`, to: `${year}-12-31`, today });
  console.log(`YEAR ${year}: effective=${hm(stats.total.effectiveMinutes)} regular=${hm(stats.total.regularMinutes)} extras=${hm(stats.total.extrasMinutes)} absence=${hm(stats.total.absenceMinutes)} workedDays=${stats.total.workedDays} free=${stats.total.freeDays} vacation=${stats.total.vacationDays} sick=${stats.total.sickLeaveDays} unresolvedDays=${stats.unresolvedDays} jtRowsIgnored=${stats.legacyDutyRows}`);
  console.log(`REALIZED=${hm(stats.realized.effectiveMinutes)} PLANNED_FUTURE=${hm(stats.planned.effectiveMinutes)}`);
  for (let m = 1; m <= 12; m += 1) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const month = computeEffectiveStats(rows.filter((r) => r.date.startsWith(key)), { from: `${key}-01`, to: `${key}-31`, today });
    console.log(`  ${key} effective=${hm(month.total.effectiveMinutes)} regular=${hm(month.total.regularMinutes)} extras=${hm(month.total.extrasMinutes)} unresolved=${month.unresolvedDays}`);
  }
  // Invariant: counted minutes must equal the union of counted intervals (no double counting).
  let doubleCounted = 0;
  for (const day of stats.days.filter((d) => !['CONFLICT', 'REQUIRES_REVIEW', 'DUTY_ONLY'].includes(d.status))) {
    const merged = [...day.workIntervals].sort((a, b) => a.start - b.start).reduce((acc, i) => {
      const last = acc[acc.length - 1];
      if (last && i.start < last.end) last.end = Math.max(last.end, i.end); else acc.push({ ...i });
      return acc;
    }, []);
    doubleCounted += day.minutes.work - merged.reduce((t, i) => t + (i.end - i.start), 0);
  }
  console.log(`JT_DOUBLE_COUNTING=${doubleCounted}  EFFECTIVE_CONFLICTS=${stats.unresolved.filter((u) => u.status === 'CONFLICT').length}`);
  process.exitCode = doubleCounted === 0 ? 0 : 2;
} finally {
  await client.end();
}
