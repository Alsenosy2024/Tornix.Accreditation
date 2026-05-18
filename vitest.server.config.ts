import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'worker/**/*.test.ts'],
    globals: true,
    setupFiles: ['./server/__tests__/setup.ts'],
  },
});
