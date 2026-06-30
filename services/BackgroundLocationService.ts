import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const LOCATION_TASK_NAME = 'PARTNER_LOCATION_TASK';

/**
 * Define the background location task at the TOP LEVEL (outside any component).
 * This is required by expo-task-manager so the background runtime can access it.
 */
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error('[BackgroundLocation] Task error:', error.message);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const latestLocation = locations[locations.length - 1];

    if (latestLocation) {
      const { latitude, longitude } = latestLocation.coords;
      console.log('[BackgroundLocation] Got location:', latitude, longitude);

      // Try to update Firebase with the latest coordinates
      try {
        // We store the partnerId in AsyncStorage when starting the task
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const partnerId = await AsyncStorage.getItem('active_partner_id');

        if (partnerId) {
          await updateDoc(doc(db, 'partners', partnerId), {
            latitude,
            longitude,
            location: { lat: latitude, lng: longitude },
            lastLocationUpdate: new Date().toISOString(),
          });
          console.log('[BackgroundLocation] Firebase updated for partner:', partnerId);
        }
      } catch (firebaseError) {
        console.error('[BackgroundLocation] Firebase update failed:', firebaseError);
      }
    }
  }
});

/**
 * Start background location tracking with a foreground service notification.
 * Call this when the partner goes "online".
 */
export async function startBackgroundLocationTracking(partnerId: string): Promise<boolean> {
  try {
    // Store partnerId so background task can access it
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem('active_partner_id', partnerId);

    // Check if already tracking
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (isTracking) {
      console.log('[BackgroundLocation] Already tracking, skipping start');
      return true;
    }

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 10000, // Update every 10 seconds
      distanceInterval: 10, // Or every 10 meters
      deferredUpdatesInterval: 5000,
      showsBackgroundLocationIndicator: true, // iOS indicator

      // Android Foreground Service — prevents OS from killing the app
      foregroundService: {
        notificationTitle: 'DirtFree Partner — You\'re Online 🟢',
        notificationBody: 'Location is being shared with customers',
        notificationColor: '#4F46E5',
        killServiceOnDestroy: false, // Keep service even if app is swiped away
      },

      // Continue tracking even when app is in background
      pausesUpdatesAutomatically: false,
    });

    console.log('[BackgroundLocation] Tracking started successfully');
    return true;
  } catch (error) {
    console.error('[BackgroundLocation] Failed to start tracking:', error);
    return false;
  }
}

/**
 * Stop background location tracking.
 * Call this when the partner goes "offline".
 */
export async function stopBackgroundLocationTracking(): Promise<void> {
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      console.log('[BackgroundLocation] Tracking stopped');
    }
  } catch (error) {
    console.error('[BackgroundLocation] Failed to stop tracking:', error);
  }
}

/**
 * Check if background location tracking is currently active.
 */
export async function isTrackingActive(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

export { LOCATION_TASK_NAME };
