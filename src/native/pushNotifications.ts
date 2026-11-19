/** Push notifications for new houses added to a vacation.
 *
 * iOS: registers for remote notifications (APNS), sends the APNS token to the server
 * via register_push_device().
 * Android: registers for FCM, sends the FCM token to the server via register_push_device().
 *
 * The server sends pushes via:
 * - iOS: Apple's push service (Edge Function push-houses, triggered by pg_cron every 5 min)
 * - Android: Firebase Cloud Messaging (Edge Function push-houses, triggered by pg_cron every 5 min)
 *
 * Tapping a push opens the linked house (or the vacation for older notifications).
 */
import { PushNotifications } from '@capacitor/push-notifications';
import type { PluginListenerHandle } from '@capacitor/core';
import { isNative, platform } from './platform';
import { hasPushAccount, registerPushToken, pushDeviceId, unregisterPushDevice, getPushNotificationSettings, setPushNotificationSetting } from '../data/sync/push';

export { pushDeviceId, getPushNotificationSettings, setPushNotificationSetting };

let starting: Promise<void> | undefined;
let tokenListener: PluginListenerHandle | undefined;
let errorListener: PluginListenerHandle | undefined;

/** App start: register for push notifications if the user has an account and notifications are on. */
export async function start(enabled = true): Promise<void> {
  if (!isNative) return;
  if (platform !== 'ios' && platform !== 'android') return;
  starting ??= register(enabled)
    .catch((error: unknown) => console.error('[push] registration setup failed', error))
    .finally(() => { starting = undefined; });
  return starting;
}

async function register(enabled: boolean): Promise<void> {
  if (!(await hasPushAccount())) return;
  if (!enabled) {
    // Notifications disabled in general: drop this phone's registration so nothing gets sent.
    const deviceId = await pushDeviceId();
    if (deviceId) {
      try {
        await unregisterPushDevice(deviceId);
        console.info('[push] push device unregistered (notifications off)');
      } catch (error) {
        console.error('[push] unregister push device failed', error);
      }
    }
    return;
  }
  await addListeners();
  if (platform === 'android') {
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') {
      console.warn('[push] notification permission not granted');
      return;
    }
  }
  await PushNotifications.register();
}

/** Called when Capacitor hands us the device token (iOS APNS token or Android FCM token). */
export async function onToken(token: string): Promise<void> {
  if (platform !== 'ios' && platform !== 'android') return;
  try {
    const deviceId = await registerPushToken(platform, token);
    console.info('[push] token registered on server', deviceId);
  } catch (error) {
    console.error('[push] token registration failed', error);
  }
}

/** Re-register this phone for pushes (turned notifications back on). */
export async function reRegister(): Promise<void> {
  if (!isNative) return;
  if (platform !== 'ios' && platform !== 'android') return;
  if (!(await hasPushAccount())) return;
  await addListeners();
  await PushNotifications.register();
}

/** Delete this phone's push device from the server (notifications off). */
export async function unregister(): Promise<void> {
  if (!isNative) return;
  if (platform !== 'ios' && platform !== 'android') return;
  const deviceId = await pushDeviceId();
  if (deviceId) {
    try {
      await unregisterPushDevice(deviceId);
      console.info('[push] push device unregistered');
    } catch (error) {
      console.error('[push] unregister push device failed', error);
    }
  }
}

/** Listener setup: forward registration tokens to the server. */
async function addListeners(): Promise<void> {
  tokenListener ??= await PushNotifications.addListener('registration', (t) => void onToken(t.value));
  errorListener ??= await PushNotifications.addListener('registrationError', (e) =>
    console.error('[push] registration error', e),
  );
}

/** Native retains cold-start tap events until this listener is attached. */
export async function onPushTap(cb: (route: string) => void): Promise<PluginListenerHandle | undefined> {
  if (!isNative) return;
  try {
    return await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const route: unknown = a.notification.data?.route;
      if (typeof route === 'string') {
        const path = `/${route.trim().replace(/^\/+/, '')}`;
        if (/^\/vacations\/[^/?#]+(?:\/houses\/[^/?#]+)?$/.test(path)) {
          cb(path);
          return;
        }
      }
      console.warn('[push] notification has no supported destination');
    });
  } catch (error) {
    console.error('[push] tap listener setup failed', error);
  }
}
