const fs = require('fs');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/verify-android-ble-manifest.js <path-to-AndroidManifest.xml>');
  process.exit(1);
}

const xml = fs.readFileSync(filePath, 'utf8');

// Collect all <uses-permission ... /> tags (self-closing or separate close)
const permTagRe = /<uses-permission[\s\S]*?(?:\/>|<\/uses-permission>)/gi;
const permTags = xml.match(permTagRe) || [];

// Collect all <uses-feature ... /> tags
const featureTagRe = /<uses-feature[\s\S]*?(?:\/>|<\/uses-feature>)/gi;
const featureTags = xml.match(featureTagRe) || [];

function findPerm(name) {
  return permTags.find(function (t) {
    return t.indexOf('android:name="' + name + '"') !== -1;
  });
}

function findFeature(name) {
  return featureTags.find(function (t) {
    return t.indexOf('android:name="' + name + '"') !== -1;
  });
}

var ok = true;

function check(desc, cond) {
  if (!cond) {
    console.error('FAIL: ' + desc);
    ok = false;
  }
}

// 1. BLUETOOTH_SCAN is present
var btScan = findPerm('android.permission.BLUETOOTH_SCAN');
check('BLUETOOTH_SCAN permission is present in manifest', btScan !== undefined);

// 2. BLUETOOTH_SCAN does NOT contain neverForLocation
if (btScan) {
  check(
    'BLUETOOTH_SCAN must NOT include neverForLocation',
    btScan.indexOf('neverForLocation') === -1,
  );
}

// 3. BLUETOOTH_CONNECT is present
check(
  'BLUETOOTH_CONNECT permission is present in manifest',
  findPerm('android.permission.BLUETOOTH_CONNECT') !== undefined,
);

// 4. ACCESS_FINE_LOCATION is present (from the non-BLE RTT plugin, but also relevant)
check(
  'ACCESS_FINE_LOCATION permission is present in manifest',
  findPerm('android.permission.ACCESS_FINE_LOCATION') !== undefined,
);

// 5. BLUETOOTH (legacy) with android:maxSdkVersion="30"
var btLegacy = findPerm('android.permission.BLUETOOTH');
check('BLUETOOTH (legacy) permission is present in manifest', btLegacy !== undefined);
if (btLegacy) {
  check(
    'BLUETOOTH (legacy) must have android:maxSdkVersion="30"',
    btLegacy.indexOf('maxSdkVersion="30"') !== -1,
  );
}

// 6. BLUETOOTH_ADMIN (legacy) with android:maxSdkVersion="30"
var btAdmin = findPerm('android.permission.BLUETOOTH_ADMIN');
check('BLUETOOTH_ADMIN (legacy) permission is present in manifest', btAdmin !== undefined);
if (btAdmin) {
  check(
    'BLUETOOTH_ADMIN (legacy) must have android:maxSdkVersion="30"',
    btAdmin.indexOf('maxSdkVersion="30"') !== -1,
  );
}

// 7. uses-feature android.hardware.bluetooth_le with android:required="false"
var feature = findFeature('android.hardware.bluetooth_le');
check(
  'uses-feature android.hardware.bluetooth_le is present in manifest',
  feature !== undefined,
);
if (feature) {
  check(
    'uses-feature bluetooth_le must have android:required="false"',
    feature.indexOf('required="false"') !== -1,
  );
}

if (ok) {
  console.log('PASS: All BLE manifest checks passed.');
} else {
  console.error('FAILED: Some BLE manifest checks did not pass.');
  process.exit(1);
}
