import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.moidev.holidayvote',
  appName: 'HolidayVote',
  webDir: 'dist',
  // ⚠ Add every new plugin here too, otherwise Android doesn't get it.
  android: {
    includePlugins: [
      '@capacitor-community/sqlite',
      '@capacitor/app',
      '@capacitor/browser',
      '@capacitor/clipboard',
      '@capacitor/filesystem',
      '@capacitor/preferences',
      '@capacitor/push-notifications',
      '@capacitor/share',
    ],
  },
  // The bot check page (website/captcha.html) and Cloudflare's check run in an embedded frame (src/native/captcha.ts):
  // without this, Android may open them in the external browser instead.
  server: {
    allowNavigation: ['holidayvote.support-moidev.workers.dev', 'challenges.cloudflare.com'],
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      androidIsEncryption: false,
    },
    // Link previews (src/native/linkPreview.ts) fetch the holiday-home page natively – the WebView
    // can't because of CORS. Only CapacitorHttp.get() is used; fetch() stays the browser's.
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
