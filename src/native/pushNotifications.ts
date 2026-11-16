/** Push notifications for new houses added to a vacation.
 *
 * iOS: registers for remote notifications, sends the APNS token to the server
 * via register_push_device(). Android: not yet (no push yet).
 *
 * The server sends pushes via Apple's push service (Edge Function push-houses,
 * triggered by pg_cron every 5 minutes). Tapping a push opens the vacation.
 */
import { PushNotifications } from '@capacitor/push-notifications';
import { isNative, platform } from './platform';
import { supabase } from '../data/sync/supabase';

let registered = false;

/** App start: register for push notifications if the user has an account. */
export async function start(): Promise<void> {
  if (!isNative) return;
  if (platform !== 'ios' && platform !== 'android') return;
  try {
    await PushNotifications.requestPermissions();
    const { data } = await supabase().auth.getSession();
    if (!data.session) return;
    await register();
  } catch {
    // Push notifications are optional; never block the app.
  }
}

async function register(): Promise<void> {
  if (registered) return;
  try {
    await PushNotifications.register();
    registered = true;
  } catch {
    // Registration failed; push notifications unavailable.
  }
}

/** Called when Capacitor hands us the device token (iOS APNS token or Android FCM token). */
export async function onToken(token: string): Promise<void> {
  const { data } = await supabase().auth.getSession();
  if (!data.session?.user) return;
  try {
    const { error } = await supabase().rpc('register_push_device', {
      p_platform: platform,
      p_token: token,
      p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      p_locale: 'de',
    });
    if (error) console.error('[push] register', error.message);
  } catch {
    // Ignore; push is optional.
  }
}

/** Listener setup: forward registration tokens to the server. */
export function addListeners(): void {
  if (!isNative) return;
  void PushNotifications.addListener('registration', (t) => void onToken(t.value));
  void PushNotifications.addListener('registrationError', (e) =>
    console.error('[push] registration error', e),
  );
}

/** Tapping an Apple push message → its route (the vacation). */
export function onPushTap(cb: (route: string) => void): void {
  if (platform !== 'ios') return;
  void PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    const route = (a.notification.data as { route?: string } | undefined)?.route;
    if (route) cb(route);
  });
}
