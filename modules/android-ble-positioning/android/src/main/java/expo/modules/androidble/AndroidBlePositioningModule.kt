package expo.modules.androidble

import android.Manifest
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AndroidBlePositioningModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AndroidBlePositioning")

    Events("onArubaBleObservation", "onArubaBleScanError")

    AsyncFunction("isBleAvailable") {
      isBleAvailable()
    }

    AsyncFunction("requestBlePermissions") {
      requestBlePermissions()
    }
  }

  // ---- Private helpers ----

  private fun isBleAvailable(): Boolean {
    val context = appContext.reactContext ?: return false

    val bluetoothManager = try {
      context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    } catch (_: Exception) {
      null
    } ?: return false

    val adapter = try {
      bluetoothManager.adapter
    } catch (_: Exception) {
      null
    } ?: return false

    return try {
      adapter.isEnabled
    } catch (_: Exception) {
      false
    }
  }

  private fun requestBlePermissions(): Boolean {
    val context = appContext.reactContext ?: return false
    return checkBleRuntimePermissions(context)
  }

  private fun checkBlePrerequisites(context: Context) {
    if (!isBleAvailable()) {
      throw BluetoothUnavailableException()
    }
    if (!checkBleRuntimePermissions(context)) {
      throw MissingPermissionException(requiredBlePermissionName())
    }
  }

  private fun checkBleRuntimePermissions(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val scanGranted = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.BLUETOOTH_SCAN
      ) == PackageManager.PERMISSION_GRANTED
      val connectGranted = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.BLUETOOTH_CONNECT
      ) == PackageManager.PERMISSION_GRANTED
      scanGranted && connectGranted
    } else {
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_FINE_LOCATION
      ) == PackageManager.PERMISSION_GRANTED
    }
  }

  private fun requiredBlePermissionName(): String {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      "BLUETOOTH_SCAN + BLUETOOTH_CONNECT"
    } else {
      "ACCESS_FINE_LOCATION"
    }
  }

  /**
   * Convert raw bytes to a contiguous lowercase hex string with no separators.
   * Example: byteArrayOf(0x1b, 0x01, 0x00) -> "1b0100".
   */
  private fun bytesToHex(bytes: ByteArray): String {
    return bytes.joinToString("") { "%02x".format(it) }
  }

  /**
   * Parse an Aruba/HPE BLE scan result into the canonical observation map.
   *
   * Mirrors the iOS `ArubaBleScanDelegate` semantics:
   *   - Manufacturer id must equal 0x011B (HPE/Aruba).
   *   - When the payload is at least 9 bytes long, bytes [3..8] are reversed
   *     to produce the BLE MAC in standard colon-separated lowercase hex
   *     (e.g. "20:4c:03:e9:00:50").
   *   - For shorter payloads, fall back to
   *     `"${device.address}_${payloadHex.take(8)}"`.
   *
   * @return populated observation map, or `null` when the manufacturer id
   *         does not match or the payload is too short to inspect.
   */
  private fun parseArubaObservation(
    device: BluetoothDevice,
    scanResult: ScanResult,
    observedAt: Long
  ): Map<String, Any>? {
    val bytes: ByteArray? = scanResult.scanRecord?.getManufacturerSpecificData(0x011B)
    if (bytes == null || bytes.size < 2) {
      return null
    }

    // Manufacturer id reconstruction (matches iOS parser at lines 489-494)
    val manufId = (bytes[0].toInt() and 0xFF) or ((bytes[1].toInt() and 0xFF) shl 8)
    if (manufId != 0x011B) {
      return null
    }

    val payloadHex = bytesToHex(bytes)

    val bleIdentifier: String = if (bytes.size >= 9) {
      bytes.slice(3..8).reversed().joinToString(":") { "%02x".format(it) }
    } else {
      "${device.address}_${payloadHex.take(8)}"
    }

    return mapOf(
      "bleIdentifier" to bleIdentifier,
      "manufacturerId" to 0x011B,
      "rssi" to scanResult.rssi,
      "payloadHex" to payloadHex,
      "observedAt" to observedAt
    )
  }
}

// ---- Custom exceptions ----

class BluetoothUnavailableException : CodedException(
  "ERR_BLUETOOTH_UNAVAILABLE",
  "Bluetooth is not available or not enabled on this device",
  null
)

class MissingPermissionException(permission: String) : CodedException(
  "ERR_MISSING_PERMISSION",
  "Missing required permission: $permission. Ensure it is declared in AndroidManifest.xml and granted at runtime.",
  null
)

class AppContextLostException : CodedException(
  "ERR_APP_CONTEXT_LOST",
  "Android application context is no longer available",
  null
)
