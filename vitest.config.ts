import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'api/**/*.test.js', 'db/**/*.test.mjs'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      ...(process.env.TEMPORAL_MODEL_DATABASE_URL ? [] : ['**/*.integration.test.mjs']),
    ],
  },
});
