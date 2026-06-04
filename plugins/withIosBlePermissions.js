const { withInfoPlist } = require('expo/config-plugins');

function withIosBlePermissions(config) {
  return withInfoPlist(config, (config) => {
    const plist = config.modResults;

    plist.NSLocationWhenInUseUsageDescription = '교내 위치 안내를 위해 위치 접근이 필요합니다.';
    plist.NSLocationTemporaryUsageDescriptionDictionary = {
      'SchoolMapPreciseLocation': '정확한 실내 위치 측위를 위해 정확한 위치 접근이 필요합니다.',
    };
    plist.NSBluetoothAlwaysUsageDescription = '실내 위치 측위를 위해 Bluetooth 접근이 필요합니다.';
    plist.NSBluetoothPeripheralUsageDescription = '실내 위치 측위를 위해 Bluetooth 접근이 필요합니다.';
    plist.NSMotionUsageDescription = '실내 보행 추적을 위해 모션 센서 접근이 필요합니다.';

    return config;
  });
}

module.exports = withIosBlePermissions;
