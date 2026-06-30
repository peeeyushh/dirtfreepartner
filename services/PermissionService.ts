import { Platform, Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import * as IntentLauncher from 'expo-intent-launcher';

export interface PermissionStatus {
  foregroundLocation: boolean;
  backgroundLocation: boolean;
  camera: boolean;
  notifications: boolean;
  allGranted: boolean;
}

/**
 * Request all critical permissions in the correct sequence.
 * Android requires foreground location → then background location (sequential).
 */
export async function requestAllPermissions(): Promise<PermissionStatus> {
  const status: PermissionStatus = {
    foregroundLocation: false,
    backgroundLocation: false,
    camera: false,
    notifications: false,
    allGranted: false,
  };

  // 1. Foreground Location (must be first)
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    status.foregroundLocation = fgStatus === 'granted';
  } catch (e) {
    console.error('[Permissions] Foreground location error:', e);
  }

  // 2. Background Location (only after foreground is granted, Android 10+)
  if (status.foregroundLocation) {
    try {
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      status.backgroundLocation = bgStatus === 'granted';

      if (!status.backgroundLocation) {
        Alert.alert(
          'Background Location Required',
          'DirtFree Partner needs "Allow all the time" location access to track your location while on duty. Please go to Settings and enable it.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
    } catch (e) {
      console.error('[Permissions] Background location error:', e);
    }
  }

  // 3. Camera Permission
  try {
    const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
    status.camera = camStatus === 'granted';
  } catch (e) {
    console.error('[Permissions] Camera error:', e);
  }

  // 4. Notifications (Android 13+ requires explicit permission)
  try {
    const { status: notifStatus } = await Notifications.requestPermissionsAsync();
    status.notifications = notifStatus === 'granted';
  } catch (e) {
    console.error('[Permissions] Notifications error:', e);
  }

  status.allGranted =
    status.foregroundLocation &&
    status.backgroundLocation &&
    status.camera &&
    status.notifications;

  return status;
}

/**
 * Request only location permissions (foreground + background).
 * Used when partner toggles online.
 */
export async function requestLocationPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  let foreground = false;
  let background = false;

  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    foreground = fgStatus === 'granted';
  } catch (e) {
    console.error('[Permissions] Foreground location error:', e);
  }

  if (foreground) {
    try {
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      background = bgStatus === 'granted';
    } catch (e) {
      console.error('[Permissions] Background location error:', e);
    }
  }

  return { foreground, background };
}

/**
 * Prompt user to disable battery optimization for this app.
 * This prevents Android from killing the foreground service.
 */
export async function requestBatteryOptimizationExemption(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
      {
        data: `package:com.hyperbeep.dirtfreepartner`,
      }
    );
  } catch (e) {
    // Fallback: open battery optimization settings
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
      );
    } catch (fallbackError) {
      console.error('[Permissions] Battery optimization settings error:', fallbackError);
      Alert.alert(
        'Battery Optimization',
        'Please go to Settings → Battery → Battery Optimization and set DirtFree Partner to "Don\'t Optimize" for reliable background tracking.',
        [{ text: 'OK' }]
      );
    }
  }
}

/**
 * Open system overlay (draw over apps) settings.
 * Required for SYSTEM_ALERT_WINDOW permission.
 */
export async function openOverlayPermissionSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.MANAGE_OVERLAY_PERMISSION,
      {
        data: `package:com.hyperbeep.dirtfreepartner`,
      }
    );
  } catch (e) {
    console.error('[Permissions] Overlay settings error:', e);
    Alert.alert(
      'Overlay Permission',
      'Please go to Settings → Apps → DirtFree Partner → Display over other apps and enable it.',
      [{ text: 'OK' }]
    );
  }
}

/**
 * Check current permission status without requesting.
 */
export async function checkPermissionStatus(): Promise<PermissionStatus> {
  const status: PermissionStatus = {
    foregroundLocation: false,
    backgroundLocation: false,
    camera: false,
    notifications: false,
    allGranted: false,
  };

  try {
    const fg = await Location.getForegroundPermissionsAsync();
    status.foregroundLocation = fg.status === 'granted';
  } catch {}

  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    status.backgroundLocation = bg.status === 'granted';
  } catch {}

  try {
    const cam = await ImagePicker.getCameraPermissionsAsync();
    status.camera = cam.status === 'granted';
  } catch {}

  try {
    const notif = await Notifications.getPermissionsAsync();
    status.notifications = notif.status === 'granted';
  } catch {}

  status.allGranted =
    status.foregroundLocation &&
    status.backgroundLocation &&
    status.camera &&
    status.notifications;

  return status;
}
