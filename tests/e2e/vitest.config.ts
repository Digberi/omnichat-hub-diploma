import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // E2E tests share a single seeded DB. Run serially to avoid cross-test data races.
    fileParallelism: false,
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
