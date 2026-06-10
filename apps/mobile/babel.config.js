module.exports = function (api) {
  api.cache(true)

  return {
    // NOTE: In NativeWind v4, `nativewind/babel` is a *preset* (it returns `{ plugins: [...] }`).
    // Using it under `plugins` causes Babel error: ".plugins is not a valid Plugin property".
    presets: [["babel-preset-expo"], "nativewind/babel"],
    // `nativewind/babel` preset already includes the required worklets plugin for Reanimated v4+.
    plugins: [],
  }
}
