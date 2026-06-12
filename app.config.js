const { expo } = require("./app.json");

module.exports = {
  expo: {
    ...expo,
    android: {
      ...expo.android,
      package: "com.schoolmap",
    },
    ios: {
      ...expo.ios,
      bundleIdentifier: "com.schoolmap",
    },
    plugins: [
      "./plugins/withAndroidRttPermissions",
      "./plugins/withAndroidBlePermissions",
      "./plugins/withIosBlePermissions",
      "@maplibre/maplibre-react-native",
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 28,
          },
        },
      ],
    ],
    assetBundlePatterns: [
      "**/*.mbtiles",
    ],
  },
};
