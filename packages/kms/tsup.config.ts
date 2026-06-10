import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    "index": "src/index.ts",
    "infisical/index": "src/infisical/index.ts",
    "nest/index": "src/nest/index.ts",
    "testing/index": "src/testing/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
})
