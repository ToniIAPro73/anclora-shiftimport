import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'api/**/*.test.js',
      'api/**/*.integration.test.mjs',
      'db/**/*.test.mjs',
      'scripts/**/*.test.mjs',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      ...(process.env.TEMPORAL_MODEL_DATABASE_URL ? [] : ['**/temporal-org-model.integration.test.mjs']),
      ...(process.env.TIME_OFF_DATABASE_URL ? [] : ['**/time-off*.integration.test.mjs']),
      ...(process.env.AUTO_PUBLISH_DATABASE_URL ? [] : ['**/auto-publish*.integration.test.mjs']),
      ...(process.env.EFFECTIVE_CALENDAR_DATABASE_URL || process.env.QA_USE_CANONICAL_DB === '1' ? [] : ['**/effective-calendar.integration.test.mjs']),
    ],
  },
});
