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
      "./plugins/withIosBlePermissions",
    ],
  },
};
