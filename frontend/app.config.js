const appJson = require("./app.json");

const NATIVE_ONLY_LOCAL_PLUGINS = new Set([
  "./plugins/withArtBoostAudioForegroundServiceGuard",
  "./plugins/withArtBoostTikTokLoginKit",
]);

const isWebExport = process.env.ARTBOOST_WEB_EXPORT === "1";
const plugins = isWebExport
  ? (appJson.expo.plugins || []).filter((plugin) => {
      const name = Array.isArray(plugin) ? plugin[0] : plugin;
      return !NATIVE_ONLY_LOCAL_PLUGINS.has(name);
    })
  : appJson.expo.plugins;

module.exports = {
  ...appJson.expo,
  plugins,
  experiments: {
    ...(appJson.expo.experiments || {}),
    baseUrl: "/app",
  },
};
