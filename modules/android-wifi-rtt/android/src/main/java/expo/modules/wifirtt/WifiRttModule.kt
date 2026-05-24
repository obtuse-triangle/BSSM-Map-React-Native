package expo.modules.wifirtt

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.Manifest
import android.net.wifi.ScanResult
import android.net.wifi.WifiManager
import android.net.wifi.rtt.RangingRequest
import android.net.wifi.rtt.RangingResult
import android.net.wifi.rtt.RangingResultCallback
import android.net.wifi.rtt.WifiRttManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class WifiRttModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AndroidWifiRtt")

    Function("isAvailable") {
      isRttAvailable()
    }

    AsyncFunction("startRttScan") { bssids: List<String> ->
      checkRttPrerequisites()
      val context = appContext.reactContext ?: throw AppContextLostException()

      val wifiRttManager = getWifiRttManager(context)
      val wifiManager = getWifiManager(context)

      val scanResults = wifiManager.scanResults
      val request = RangingRequest.Builder().apply {
        for (bssid in bssids) {
          val scanResult = scanResults.find { it.BSSID == bssid }
          if (scanResult != null) {
            addAccessPoint(scanResult)
          }
        }
      }.build()

      if (request.rttPeers.isEmpty()) {
        return@AsyncFunction emptyList<Map<String, Any>>()
      }

      val results = mutableListOf<Map<String, Any>>()
      val latch = CountDownLatch(1)

      wifiRttManager.startRanging(
        request,
        ContextCompat.getMainExecutor(context),
        object : RangingResultCallback() {
          override fun onRangingResults(rangingResults: List<RangingResult>) {
            for (result in rangingResults) {
              results.add(
                mapOf(
                  "bssid" to result.macAddress?.toString().orEmpty(),
                  "distanceMm" to result.distanceMm,
                  "distanceStdDevMm" to result.distanceStdDevMm,
                  "rssi" to result.rssi,
                  "success" to (result.status == RangingResult.STATUS_SUCCESS),
                  "timestamp" to System.currentTimeMillis()
                )
              )
            }
            latch.countDown()
          }

          override fun onRangingFailure(code: Int) {
            latch.countDown()
          }
        }
      )

      latch.await(10, TimeUnit.SECONDS)
      results
    }

    AsyncFunction("getAvailableAccessPoints") {
      checkScanPrerequisites()
      val context = appContext.reactContext ?: throw AppContextLostException()

      val wifiManager = getWifiManager(context)
      val scanResultLatch = CountDownLatch(1)
      val scanReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          if (intent?.action == WifiManager.SCAN_RESULTS_AVAILABLE_ACTION) {
            scanResultLatch.countDown()
          }
        }
      }

      try {
        context.registerReceiver(
          scanReceiver,
          IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION)
        )

        @Suppress("DEPRECATION")
        val scanStarted = wifiManager.startScan()

        if (!scanStarted) {
          return@AsyncFunction wifiManager.scanResults.map { scanResultToMap(it) }
        }

        scanResultLatch.await(10, TimeUnit.SECONDS)
      } finally {
        try {
          context.unregisterReceiver(scanReceiver)
        } catch (_: IllegalArgumentException) {
          // Receiver was not registered
        }
      }

      wifiManager.scanResults.map { scanResultToMap(it) }
    }
  }

  // ---- Private helpers ----

  private fun isRttAvailable(): Boolean {
    val context = appContext.reactContext ?: return false

    val wifiRttManager = try {
      context.getSystemService(Context.WIFI_RTT_RUNTIME_SERVICE) as? WifiRttManager
    } catch (_: Exception) {
      null
    } ?: return false

    val locationManager = try {
      context.getSystemService(Context.LOCATION_SERVICE) as? android.location.LocationManager
    } catch (_: Exception) {
      null
    } ?: return false

    val wifiManager = try {
      context.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    } catch (_: Exception) {
      null
    } ?: return false

    return wifiRttManager.isAvailable &&
      (locationManager.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER) ||
        locationManager.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER)) &&
      wifiManager.isWifiEnabled
  }

  private fun checkRttPrerequisites() {
    val context = appContext.reactContext ?: throw AppContextLostException()

    checkPermissions(context, requireFineLocation = true)
    checkLocationEnabled(context)

    val wifiRttManager = try {
      context.getSystemService(Context.WIFI_RTT_RUNTIME_SERVICE) as? WifiRttManager
    } catch (_: Exception) {
      null
    }
    if (wifiRttManager == null || !wifiRttManager.isAvailable) {
      throw RttNotAvailableException()
    }
  }

  private fun checkScanPrerequisites() {
    val context = appContext.reactContext ?: throw AppContextLostException()
    checkPermissions(context, requireFineLocation = false)
    checkLocationEnabled(context)
  }

  private fun checkPermissions(context: Context, requireFineLocation: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val nearbyWifi = ContextCompat.checkSelfPermission(context, Manifest.permission.NEARBY_WIFI_DEVICES)
      if (nearbyWifi != PackageManager.PERMISSION_GRANTED) {
        throw MissingPermissionException("NEARBY_WIFI_DEVICES")
      }
    }
    if (requireFineLocation) {
      val fineLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
      if (fineLocation != PackageManager.PERMISSION_GRANTED) {
        throw MissingPermissionException("ACCESS_FINE_LOCATION")
      }
    }
  }

  private fun checkLocationEnabled(context: Context) {
    val locationManager = try {
      context.getSystemService(Context.LOCATION_SERVICE) as? android.location.LocationManager
    } catch (_: Exception) {
      null
    }
    val isGpsEnabled = locationManager?.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) == true
    val isNetworkEnabled = locationManager?.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER) == true
    if (!isGpsEnabled && !isNetworkEnabled) {
      throw LocationDisabledException()
    }
  }

  private fun getWifiRttManager(context: Context): WifiRttManager {
    return try {
      context.getSystemService(Context.WIFI_RTT_RUNTIME_SERVICE) as WifiRttManager
    } catch (_: Exception) {
      throw RttNotAvailableException()
    }
  }

  private fun getWifiManager(context: Context): WifiManager {
    return try {
      context.getSystemService(Context.WIFI_SERVICE) as WifiManager
    } catch (_: Exception) {
      throw WifiDisabledException()
    }
  }

  private fun scanResultToMap(result: ScanResult): Map<String, Any> {
    return mapOf(
      "bssid" to result.BSSID,
      "ssid" to result.SSID,
      "frequency" to result.frequency,
      "is80211mcResponder" to (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) result.is80211mcResponder else false)
    )
  }
}

// ---- Custom exceptions ----

class RttNotAvailableException : CodedException(
  "ERR_RTT_NOT_AVAILABLE",
  "WiFi RTT is not available on this device",
  null
)

class WifiDisabledException : CodedException(
  "ERR_WIFI_DISABLED",
  "WiFi is not available or not enabled on this device",
  null
)

class LocationDisabledException : CodedException(
  "ERR_LOCATION_DISABLED",
  "Location services must be enabled for WiFi scanning and RTT ranging",
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
