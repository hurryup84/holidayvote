/** App-wide constants. Store IDs are filled in once the store listings exist. */
export const APP_CONFIG = {
  appName: 'HolidayVote',
  websiteUrl: 'https://holidayvote.support-moidev.workers.dev',
  get privacyUrl() {
    return `${this.websiteUrl}/datenschutz`;
  },
  get supportUrl() {
    return `${this.websiteUrl}/support`;
  },
  get termsUrl() {
    return `${this.websiteUrl}/nutzungsbedingungen`;
  },
  /** Bump when the terms of use change → users accept again before the next invite / join. */
  termsVersion: '2026-11',
  imprintUrl: 'https://moidev.support-moidev.workers.dev/impressum',
  /** App Store numeric ID – TODO once the app exists in App Store Connect. */
  appStoreId: '',
  playStoreId: 'com.moidev.holidayvote',
  /** Map tiles (OpenStreetMap). Attribution is shown on the map. */
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  /** Address → coordinates (OpenStreetMap Nominatim, max. 1 request per second). */
  geocodeUrl: 'https://nominatim.openstreetmap.org/search',
};

/** Debug page: dev server and `npm run build:dev` builds, never in store builds. */
export const DEBUG_TOOLS = import.meta.env.DEV || import.meta.env.MODE === 'development';
