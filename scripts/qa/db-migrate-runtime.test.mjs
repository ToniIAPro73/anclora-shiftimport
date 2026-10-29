import { describe, expect, it } from 'vitest';
import { buildMigrationEnvironment, canonicalMigrationTarget } from './db-migrate-runtime.mjs';

const mainDirect = 'postgresql://qa:secret@ep-lingering-dew-b1atfd0w.c-5.eu-central-1.aws.neon.tech/neondb';

describe('production-backed migration runtime', () => {
  it('selects the direct canonical Neon main endpoint', () => {
    expect(canonicalMigrationTarget({ DATABASE_URL: 'postgresql://qa:secret@ep-lingering-dew-b1atfd0w-pooler.c-5.eu-central-1.aws.neon.tech/neondb', DATABASE_URL_UNPOOLED: mainDirect }))
      .toEqual({ connectionString: mainDirect, directConnectionString: mainDirect });
  });

  it('rejects local Docker and non-canonical database endpoints', () => {
    expect(() => canonicalMigrationTarget({ DATABASE_URL: 'postgresql://qa:secret@localhost:5433/neondb' })).toThrow(/not canonical Neon Production main/);
    expect(() => canonicalMigrationTarget({ DATABASE_URL: 'postgresql://qa:secret@ep-other-b1atfd0w.c-5.eu-central-1.aws.neon.tech/neondb' })).toThrow(/not canonical Neon Production main/);
  });

  it('overrides local database variables and removes QA Docker overrides', () => {
    const env = buildMigrationEnvironment(
      { DATABASE_URL: mainDirect, DATABASE_URL_UNPOOLED: mainDirect },
      { DATABASE_URL: 'postgresql://local@localhost:5433/neondb', PGHOST: 'localhost', QA_ALLOW_LOCAL_DOCKER: '1', KEEP_ME: 'yes' },
    );
    expect(env.DATABASE_URL).toBe(mainDirect);
    expect(env.DATABASE_URL_UNPOOLED).toBe(mainDirect);
    expect(env.PGHOST).toBeUndefined();
    expect(env.QA_ALLOW_LOCAL_DOCKER).toBeUndefined();
    expect(env.KEEP_ME).toBe('yes');
  });
});
