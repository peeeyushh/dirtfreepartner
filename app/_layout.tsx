import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import MaintenanceScreen from './maintenance';

function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const [isMaintenance, setIsMaintenance] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setIsMaintenance(snapshot.data().maintenanceMode || false);
      } else {
        setIsMaintenance(false);
      }
    });
    return () => unsubscribe();
  }, []);

  if (isMaintenance === true) {
    return <MaintenanceScreen />;
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <MaintenanceGuard>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="otp" />
            <Stack.Screen name="register" />
            <Stack.Screen name="pending" />
            <Stack.Screen name="maintenance" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </MaintenanceGuard>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
