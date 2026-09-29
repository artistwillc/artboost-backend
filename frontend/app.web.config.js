const appJson = require("./app.json");

const NATIVE_ONLY_LOCAL_PLUGINS = new Set([
  "./plugins/withArtBoostAudioForegroundServiceGuard",
  "./plugins/withArtBoostTikTokLoginKit",
]);

const plugins = (appJson.expo.plugins || []).filter((plugin) => {
  const name = Array.isArray(plugin) ? plugin[0] : plugin;
  return !NATIVE_ONLY_LOCAL_PLUGINS.has(name);
});

module.exports = {
  ...appJson.expo,
  plugins,
  experiments: {
    ...(appJson.expo.experiments || {}),
    baseUrl: "/app",
  },
};
