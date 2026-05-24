import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { HomeScreen } from '../screens/HomeScreen';
import { DebugRttScreen } from '../screens/DebugRttScreen';
import { MapScreen } from '../screens/MapScreen';
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
      <Stack.Screen name="DebugRtt" component={DebugRttScreen} />
    </Stack.Navigator>
  );
}
