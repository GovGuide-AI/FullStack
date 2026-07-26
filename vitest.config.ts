import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
      '@': rootDir.replace(/\/$/, ''),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Integration tests share one Postgres database, so they must not race.
    fileParallelism: false,
  },
});
