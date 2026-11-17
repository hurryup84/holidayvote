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
 * Tapping a push opens the vacation.
 */
import { PushNotifications } from '@capacitor/push-notifications';
import type { PluginListenerHandle } from '@capacitor/core';
import { isNative, platform } from './platform';
import { hasPushAccount, registerPushToken } from '../data/sync/push';

let starting: Promise<void> | undefined;
let tokenListener: PluginListenerHandle | undefined;
let errorListener: PluginListenerHandle | undefined;

/** App start: register for push notifications if the user has an account. */
export async function start(): Promise<void> {
  if (!isNative) return;
  if (platform !== 'ios' && platform !== 'android') return;
  starting ??= register()
    .catch((error: unknown) => console.error('[push] registration setup failed', error))
    .finally(() => { starting = undefined; });
  return starting;
}

async function register(): Promise<void> {
  if (!(await hasPushAccount())) return;
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
    await registerPushToken(platform, token);
    console.info('[push] token registered on server');
  } catch (error) {
    console.error('[push] token registration failed', error);
  }
}

/** Listener setup: forward registration tokens to the server. */
async function addListeners(): Promise<void> {
  tokenListener ??= await PushNotifications.addListener('registration', (t) => void onToken(t.value));
  errorListener ??= await PushNotifications.addListener('registrationError', (e) =>
    console.error('[push] registration error', e),
  );
}

/** Tapping a push notification → navigate to the vacation route. Works on iOS and Android. */
export function onPushTap(cb: (route: string) => void): void {
  if (!isNative) return;
  void PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    const route = (a.notification.data as { route?: string } | undefined)?.route;
    if (route) cb(route);
  });
}
