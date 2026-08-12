import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    /*
     * `.claude/**` holds git worktrees — full copies of this repo. Without it
     * every suite runs twice and the totals silently double.
     */
    exclude: ['node_modules/**', '.next/**', '.claude/**', '**/node_modules/**'],
    /*
     * `db/index.ts` builds its client at module scope, so importing anything
     * that transitively touches it needs a URL. Pointing at an anonymous
     * in-memory database rather than local.db means a test can never write to
     * the development collection, even by accident.
     */
    env: { DATABASE_URL: 'file::memory:' },
  },
});
