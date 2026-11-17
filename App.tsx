import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useCameraPermissions } from 'expo-camera';
import { DeviceMotion } from 'expo-sensors';
import { Room } from './src/building';
import SearchScreen from './src/SearchScreen';
import NavScreen from './src/NavScreen';

export default function App() {
  const [camPerm, requestCam] = useCameraPermissions();
  const [nav, setNav] = useState<{ room: Room; camera: boolean; run: number } | null>(null);
  const [lastRoom, setLastRoom] = useState('');

  // Ask for camera + motion when the student taps "Start", then start guiding.
  const start = async (room: Room) => {
    let camera = !!camPerm?.granted;
    if (!camera) {
      try { camera = (await requestCam()).granted; } catch { camera = false; }
    }
    try { await DeviceMotion.requestPermissionsAsync(); } catch { /* button fallback */ }
    setLastRoom(room.id);
    setNav({ room, camera, run: Date.now() });
  };

  return (
    <SafeAreaProvider>
      <StatusBar style={nav ? 'dark' : 'light'} />
      {nav ? (
        <NavScreen key={nav.run} room={nav.room} camera={nav.camera} onDone={() => setNav(null)} />
      ) : (
        <SearchScreen initial={lastRoom} onStart={start} />
      )}
    </SafeAreaProvider>
  );
}
