import { APP_CONFIG } from './config';

/**
 * Invite links. Shared as https://<website>/join?c=K7P2QX (clickable in every messenger; a static
 * page, website/join.html) which opens the app via com.moidev.holidayvote://join/K7P2QX.
 * The app accepts all forms: /join/CODE, /join?c=CODE, /join?code=CODE.
 */
export function inviteCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/join(?:\/|(?:\.html)?\?(?:c|code)=)([A-Za-z0-9]{6})(?![A-Za-z0-9])/i.exec(url);
  return m ? m[1].toUpperCase() : null;
}

export function inviteUrl(code: string): string {
  return `${APP_CONFIG.websiteUrl}/join?c=${code}`;
}
