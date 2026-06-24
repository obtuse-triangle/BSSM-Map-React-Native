import { useCallback, useState } from 'react'
import { Alert, Linking, Platform } from 'react-native'
import { LocationManager } from '@maplibre/maplibre-react-native'
import { getBleScanner } from '../services/location/bleScannerAdapter'

export function usePermissions() {
  const [isLoading, setIsLoading] = useState(false)

  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    setIsLoading(true)
    try {
      const granted = await LocationManager.requestPermissions()
      if (!granted) {
        Alert.alert(
          '위치 권한 필요',
          '지도에서 현재 위치를 표시하려면 위치 권한이 필요합니다.',
          [
            { text: '취소' },
            { text: '설정 열기', onPress: () => Linking.openSettings() },
          ],
        )
        return false
      }
      return true
    } finally {
      setIsLoading(false)
    }
  }, [])

  const requestPreciseLocation = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      const scanner = getBleScanner()
      if (!scanner) {
        return true
      }
      try {
        const granted = await scanner.requestBlePermissions()
        if (!granted) {
          Alert.alert(
            'BLE 권한 필요',
            'BLE 기반 실내 위치 확인을 위해 블루투스 및 위치 권한이 필요합니다.',
            [{ text: '확인' }],
          )
          return false
        }
        return true
      } catch {
        Alert.alert(
          'BLE 권한 필요',
          'BLE 기반 실내 위치 확인을 위해 블루투스 및 위치 권한이 필요합니다.',
          [{ text: '확인' }],
        )
        return false
      }
    }

    if (Platform.OS !== 'ios') {
      return true
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { IosBlePositioning } = require('../../modules/ios-ble-positioning/src');
      await IosBlePositioning.requestPreciseLocationPermission()
      return true
    } catch {
      Alert.alert(
        '정확한 위치',
        '더 정확한 실내 위치 확인을 위해 정확한 위치 권한을 허용해주세요.',
        [{ text: '확인' }],
      )
      return false
    }
  }, [])

  return { requestLocationPermission, requestPreciseLocation, isLoading }
}
