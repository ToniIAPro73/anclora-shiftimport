// One-shot backfill for pre-0010 import rows: fills employee_count,
// shift_count, created_shift_count, existing_shift_count, period_kind and
// period_label from the shifts still linked by import_id.
//
// Target rows are exactly the historical ones: migration 0010 added these
// columns with DEFAULT 0 / '', and rows created after 0010 always carry a
// non-empty period_label. Soft-deleted imports are skipped — their shifts
// were hard-deleted, so there is nothing to count.
//
// created_shift_count = shift_count and existing_shift_count = 0 is the best
// available approximation: the pre-0010 createImport never recorded the
// created/existing split.
//
// Usage:
//   node --env-file=.env.development.local db/backfill-import-counters.mjs
//   DATABASE_URL="postgres://..." node db/backfill-import-counters.mjs
import { neon } from '@neondatabase/serverless';

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const monthName = (month1Based) => MONTHS_ES[month1Based - 1];

/** "Enero 2026" for a single month, "Enero–Septiembre 2026" for a span. */
const buildPeriodLabel = (start, end) => {
  const sameMonth = start.year === end.year && start.month === end.month;
  if (sameMonth) {
    return `${monthName(start.month)} ${start.year}`;
  }
  return `${monthName(start.month)}–${monthName(end.month)} ${end.year}`;
};

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  const sql = neon(connectionString);

  const targets = await sql`
    SELECT id, period_year, period_month
    FROM imports
    WHERE period_label = ''
      AND deleted_at IS NULL
    ORDER BY created_at
  `;

  if (targets.length === 0) {
    console.log('nothing to backfill');
    return;
  }

  console.log(`backfilling ${targets.length} import row(s)`);

  for (const row of targets) {
    const stats = await sql`
      SELECT
        COUNT(*)::int AS shift_count,
        COUNT(DISTINCT employee_id)::int AS employee_count,
        MIN(date) AS first_date,
        MAX(date) AS last_date
      FROM shifts
      WHERE import_id = ${row.id}
    `;
    const { shift_count: shiftCount, employee_count: employeeCount, first_date: firstDate, last_date: lastDate } = stats[0];

    let periodLabel = '';
    let periodKind = 'single';

    if (firstDate && lastDate) {
      // date comes back as a string (YYYY-MM-DD) or Date depending on driver;
      // normalize through Date to be safe.
      const start = new Date(firstDate);
      const end = new Date(lastDate);
      const s = { year: start.getUTCFullYear(), month: start.getUTCMonth() + 1 };
      const e = { year: end.getUTCFullYear(), month: end.getUTCMonth() + 1 };
      periodLabel = buildPeriodLabel(s, e);
      periodKind = s.year === e.year && s.month === e.month ? 'single' : 'multi';
    } else if (row.period_year && row.period_month) {
      // Import with no surviving shifts: fall back to the recorded period.
      periodLabel = `${monthName(row.period_month)} ${row.period_year}`;
    }

    await sql`
      UPDATE imports
      SET employee_count = ${employeeCount},
          shift_count = ${shiftCount},
          created_shift_count = ${shiftCount},
          existing_shift_count = 0,
          period_kind = ${periodKind},
          period_label = ${periodLabel},
          updated_at = NOW()
      WHERE id = ${row.id}
    `;

    console.log(
      `  ${row.id}: employees=${employeeCount} shifts=${shiftCount} period="${periodLabel || '—'}" (${periodKind})`,
    );
  }

  console.log('backfill done');
}

main().catch((error) => {
  console.error('backfill failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
