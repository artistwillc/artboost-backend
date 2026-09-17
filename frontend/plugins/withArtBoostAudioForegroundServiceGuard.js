const { withAndroidManifest } = require('@expo/config-plugins');

// ArtBoost uses expo-audio for foreground Consultant microphone input only.
// It does not use sustained background playback, lock-screen media controls,
// or background recording. Expo SDK 54's expo-audio Android manifest can merge
// its foreground services into the final app even when those capabilities are
// not used. Google Play flags those services because Android 15+ forbids the
// restricted foreground-service start paths reachable from BOOT_COMPLETED.
//
// Keep RECORD_AUDIO and normal foreground recording intact, but remove the two
// unused expo-audio foreground services from the generated Android manifest.
const BLOCKED_SERVICES = new Set([
  'expo.modules.audio.service.AudioControlsService',
  'expo.modules.audio.service.AudioRecordingService',
]);

const PORTRAIT_FEATURE = 'android.hardware.screen.portrait';

function markPortraitFeatureOptional(manifest) {
  const features = Array.isArray(manifest['uses-feature'])
    ? manifest['uses-feature']
    : [];

  const existing = features.find(
    (feature) => feature?.$?.['android:name'] === PORTRAIT_FEATURE
  );

  if (existing) {
    existing.$['android:required'] = 'false';
  } else {
    features.push({
      $: {
        'android:name': PORTRAIT_FEATURE,
        'android:required': 'false',
      },
    });
  }

  manifest['uses-feature'] = features;
}

function withArtBoostAudioForegroundServiceGuard(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults?.manifest;
    if (!manifest) return config;

    // Build 14 still exposed android.hardware.screen.portrait to Google Play.
    // ArtBoost is intended to support resizable tablet/foldable layouts, so
    // explicitly make portrait capability optional in the generated manifest.
    markPortraitFeatureOptional(manifest);

    const application = manifest.application?.[0];
    if (!application) return config;

    const services = Array.isArray(application.service) ? application.service : [];
    application.service = services.filter((service) => {
      const name = service?.$?.['android:name'];
      return !BLOCKED_SERVICES.has(name);
    });

    return config;
  });
}

module.exports = withArtBoostAudioForegroundServiceGuard;
