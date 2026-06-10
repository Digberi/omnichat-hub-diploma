const { withNativeWind } = require("nativewind/metro")
const { getDefaultConfig } = require("expo/metro-config")
const path = require("path")

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")

const config = getDefaultConfig(projectRoot)
const withNativeWindConfig = withNativeWind(config, { input: "./global.css", inlineRem: 16 })

// Make Metro aware of workspace packages.
withNativeWindConfig.resolver.unstable_enableSymlinks = true
// NOTE: With pnpm's default (isolated) linker, many transitive deps live inside the virtual store.
// Disabling hierarchical lookup can break resolution for those deps (e.g. `expo-modules-core`).
withNativeWindConfig.resolver.disableHierarchicalLookup = false
withNativeWindConfig.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
]
withNativeWindConfig.watchFolders = [workspaceRoot]

module.exports = withNativeWindConfig
