import { supabase, syncConfigured } from './supabase';

export async function hasPushAccount(): Promise<boolean> {
  if (!syncConfigured) return false;
  const { data, error } = await supabase().auth.getSession();
  if (error) throw error;
  return Boolean(data.session?.user);
}

export async function registerPushToken(platform: 'ios' | 'android', token: string): Promise<string | null> {
  if (!(await hasPushAccount())) throw new Error('No account available for push registration');
  const { data, error } = await supabase().rpc('register_push_device', {
    p_platform: platform,
    p_token: token,
    p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    p_locale: 'de',
  });
  if (error) throw new Error(`register_push_device: ${error.message}`);
  return (data as { device_id?: string | null } | null)?.device_id ?? null;
}

/** This phone's registered push device id (null if not registered). */
export async function pushDeviceId(): Promise<string | null> {
  if (!syncConfigured) return null;
  const { data, error } = await supabase().rpc('push_device_id');
  if (error) throw new Error(`push_device_id: ${error.message}`);
  return (data as string | null) ?? null;
}

/** Delete this phone's push device (and its per-vacation settings) from the server. */
export async function unregisterPushDevice(deviceId: string): Promise<void> {
  const { error } = await supabase().rpc('unregister_push_device', { p_device_id: deviceId });
  if (error) throw new Error(`unregister_push_device: ${error.message}`);
}

/** Read this device's per-vacation notification settings. */
export async function getPushNotificationSettings(deviceId: string): Promise<{ vacationId: string; enabled: boolean }[]> {
  const { data, error } = await supabase().rpc('get_push_notification_settings', { p_device_id: deviceId });
  if (error) throw new Error(`get_push_notification_settings: ${error.message}`);
  const rows = (data as { vacation_id: string; enabled: boolean }[] | null) ?? [];
  return rows.map((r) => ({ vacationId: r.vacation_id, enabled: r.enabled }));
}

/** Enable or disable notifications for one vacation on this device. */
export async function setPushNotificationSetting(
  deviceId: string,
  vacationId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase().rpc('set_push_notification_setting', {
    p_device_id: deviceId,
    p_vacation_id: vacationId,
    p_enabled: enabled,
  });
  if (error) throw new Error(`set_push_notification_setting: ${error.message}`);
}
