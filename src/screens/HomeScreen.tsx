import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bssmFloorMap } from '../constants/bssmFloorMap';
import type { RootStackParamList } from '../navigation/types';
import { getFloorList } from '../utils/floorMap';
import { Button } from '../components/common';
import { BG_WHITE, BORDER_LIGHT, PRIMARY_BLUE, TEXT_DARK, TEXT_MEDIUM, TEXT_SECONDARY } from '../theme';

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const floorCount = getFloorList(bssmFloorMap).length;

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}>
      <View style={styles.hero}>
        <Text style={styles.badge}>BSSM 학교 지도</Text>
        <Text style={styles.title}>층을 선택하고 교실을 바로 확인하세요</Text>
        <Text style={styles.description}>
          React Native 네이티브 레이아웃으로 BSSM 층 지도를 렌더링합니다. 현재는 1~4층을 빠르게 탐색하고 교실 세부 정보를 확인할 수 있습니다.
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{floorCount}</Text>
            <Text style={styles.statLabel}>개 층</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>Native</Text>
            <Text style={styles.statLabel}>렌더러</Text>
          </View>
        </View>

        <Button variant="primary" size="large" title="지도 열기" onPress={() => navigation.navigate('Map')} style={{ borderRadius: 18 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  hero: {
    backgroundColor: BG_WHITE,
    borderColor: BORDER_LIGHT,
    borderRadius: 28,
    borderWidth: 1,
    gap: 16,
    padding: 24,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    color: PRIMARY_BLUE,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  title: {
    color: TEXT_DARK,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 36,
  },
  description: {
    color: TEXT_MEDIUM,
    fontSize: 15,
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    backgroundColor: '#f8fbff',
    borderColor: BORDER_LIGHT,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    padding: 16,
  },
  statValue: {
    color: TEXT_DARK,
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    color: TEXT_SECONDARY,
    fontSize: 13,
  },

});
