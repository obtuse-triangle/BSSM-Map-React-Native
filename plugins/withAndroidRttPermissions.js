const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withAndroidRttPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = [];
    }

    manifest.manifest['uses-permission'].push(
      { $: { 'android:name': 'android.permission.ACCESS_FINE_LOCATION' } },
      { $: { 'android:name': 'android.permission.ACCESS_WIFI_STATE' } },
      {
        $: {
          'android:name': 'android.permission.NEARBY_WIFI_DEVICES',
          'android:usesPermissionFlags': 'neverForLocation',
        },
      },
    );

    return config;
  });
};
