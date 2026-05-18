import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'worker/**/*.test.ts'],
    globals: true,
    setupFiles: ['./server/__tests__/setup.ts'],
    // Run test files sequentially in a single worker so the shared
    // beforeAll in setup.ts (DROP/CREATE DATABASE) only executes once.
    pool: 'forks',
    fileParallelism: false,
  },
});
