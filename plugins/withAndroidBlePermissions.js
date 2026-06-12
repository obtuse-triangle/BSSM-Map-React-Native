const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withAndroidBlePermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = [];
    }

    manifest.manifest['uses-permission'].push(
      { $: { 'android:name': 'android.permission.BLUETOOTH_SCAN' } },
      { $: { 'android:name': 'android.permission.BLUETOOTH_CONNECT' } },
      {
        $: {
          'android:name': 'android.permission.BLUETOOTH',
          'android:maxSdkVersion': '30',
        },
      },
      {
        $: {
          'android:name': 'android.permission.BLUETOOTH_ADMIN',
          'android:maxSdkVersion': '30',
        },
      },
    );

    if (!manifest.manifest['uses-feature']) {
      manifest.manifest['uses-feature'] = [];
    }

    manifest.manifest['uses-feature'].push({
      $: {
        'android:name': 'android.hardware.bluetooth_le',
        'android:required': 'false',
      },
    });

    return config;
  });
};
