import { supabase, syncConfigured } from './supabase';

export async function hasPushAccount(): Promise<boolean> {
  if (!syncConfigured) return false;
  const { data, error } = await supabase().auth.getSession();
  if (error) throw error;
  return Boolean(data.session?.user);
}

export async function registerPushToken(platform: 'ios' | 'android', token: string): Promise<void> {
  if (!(await hasPushAccount())) throw new Error('No account available for push registration');
  const { error } = await supabase().rpc('register_push_device', {
    p_platform: platform,
    p_token: token,
    p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    p_locale: 'de',
  });
  if (error) throw new Error(`register_push_device: ${error.message}`);
}
