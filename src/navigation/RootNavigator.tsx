import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { HomeScreen } from '../screens/HomeScreen';
import { DebugRttScreen } from '../screens/DebugRttScreen';
import { MapScreen } from '../screens/MapScreen';
import { MapSheetScreen } from '../screens/MapSheetScreen';
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
          sheetAllowedDetents: [0.12, 0.5, 1.0],
          sheetInitialDetentIndex: 0,
          sheetGrabberVisible: true,
          gestureEnabled: false,
          sheetLargestUndimmedDetentIndex: 0,
          headerShown: false,
        }}
      />
      <Stack.Screen name="DebugRtt" component={DebugRttScreen} />
    </Stack.Navigator>
  );
}
