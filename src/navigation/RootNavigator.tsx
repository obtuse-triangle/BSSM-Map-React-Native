import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { HomeScreen } from '../screens/HomeScreen';
import { DebugRttScreen } from '../screens/DebugRttScreen';
import { MapScreen } from '../screens/MapScreen';
import { MapSheetScreen } from '../screens/MapSheetScreen';
import { PlaceDetailSheetScreen } from '../screens/PlaceDetailSheetScreen';
import { RoutePlanScreen } from '../screens/RoutePlanScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Map"
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: '#f4f7fb',
        },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Map" component={MapScreen} />
      <Stack.Screen
        name="MapSheet"
        component={MapSheetScreen}
        options={{
          presentation: 'formSheet',
          contentStyle: { backgroundColor: 'transparent' },
          sheetAllowedDetents: [0.06, 0.12, 0.5, 1.0],
          sheetInitialDetentIndex: 1,
          sheetGrabberVisible: true,
          gestureEnabled: false,
          sheetLargestUndimmedDetentIndex: 3,
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="PlaceDetailSheet"
        component={PlaceDetailSheetScreen}
        options={{
          presentation: 'formSheet',
          contentStyle: { backgroundColor: 'transparent' },
          sheetAllowedDetents: [0.09, 0.3, 0.55, 1.0],
          sheetInitialDetentIndex: 1,
          sheetGrabberVisible: true,
          sheetLargestUndimmedDetentIndex: 3,
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="RoutePlan"
        component={RoutePlanScreen}
        options={{
          presentation: 'formSheet',
          contentStyle: { backgroundColor: 'transparent' },
          sheetAllowedDetents: [0.09, 0.3, 0.55, 1.0],
          sheetInitialDetentIndex: 1,
          sheetGrabberVisible: true,
          sheetLargestUndimmedDetentIndex: 3,
          headerShown: false,
        }}
      />
      <Stack.Screen name="DebugRtt" component={DebugRttScreen} />
    </Stack.Navigator>
  );
}
