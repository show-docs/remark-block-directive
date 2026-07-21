import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/*.mts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**'],
    },
  },
});
