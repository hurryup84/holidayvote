import i18n from 'i18next';
import { APP_CONFIG } from '../core/config';
import './captcha.css';

/**
 * Bot check (Cloudflare Turnstile) before the app creates an account: first sharing, joining, recovery –
 * once per phone. Turnstile only runs on a real web page, so the check page lives on the website
 * (website/captcha.html) and is shown here in an embedded frame; it hands the token back by postMessage.
 * Usually invisible: a short "checking …" sheet, a click only when Cloudflare is unsure.
 *
 * The token goes to Supabase with the sign-in (Auth → Attack Protection → CAPTCHA decides). Never blocks
 * on its own: if the page can't be reached, the sign-in goes ahead without a token and the server decides.
 */
export class CaptchaCancelled extends Error {
  constructor() {
    super('captcha_cancelled');
  }
}

/** No "ready" from the page by then (offline, page unreachable): go ahead without a token. */
const LOAD_TIMEOUT_MS = 12_000;
/** Page there, but no token (and no click wanted): give up waiting. A click request has no time limit. */
const TOKEN_TIMEOUT_MS = 45_000;

/** Turnstile token, `undefined` when the check couldn't run (offline, page missing); throws CaptchaCancelled. */
export function captchaToken(opts: { test?: boolean } = {}): Promise<string | undefined> {
  const page = new URL('/captcha', APP_CONFIG.websiteUrl);
  page.searchParams.set('origin', window.location.origin);
  page.searchParams.set('lang', i18n.language?.startsWith('en') ? 'en' : 'de');
  if (opts.test) page.searchParams.set('test', '1');

  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.className = 'captcha-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const sheet = document.createElement('div');
    sheet.className = 'captcha-sheet';
    const text = document.createElement('p');
    text.textContent = i18n.t('captcha.checking');
    const frame = document.createElement('iframe');
    frame.title = i18n.t('captcha.title');
    frame.src = page.toString();
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'captcha-cancel';
    cancel.textContent = i18n.t('common.cancel');
    sheet.append(text, frame, cancel);
    overlay.append(sheet);

    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      overlay.remove();
      fn();
    };
    const onMessage = (e: MessageEvent) => {
      const m = e.data as { source?: string; type?: string; token?: string; code?: string } | null;
      if (e.origin !== page.origin || m?.source !== 'holidayvote-captcha') return;
      if (m.type === 'token' && m.token) finish(() => resolve(m.token));
      else if (m.type === 'ready') wait(TOKEN_TIMEOUT_MS);
      else if (m.type === 'interactive') {
        window.clearTimeout(timer); // a person is clicking – no time limit
        sheet.classList.add('is-interactive');
        text.textContent = i18n.t('captcha.click');
      } else if (m.type === 'error') console.warn('[captcha] Turnstile error', m.code); // Turnstile retries by itself
    };
    // Unreachable / no token: go ahead without one – the server decides (and says so if it wants one).
    let timer = 0;
    const wait = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => finish(() => resolve(undefined)), ms);
    };
    wait(LOAD_TIMEOUT_MS);
    cancel.onclick = () => finish(() => reject(new CaptchaCancelled()));

    window.addEventListener('message', onMessage);
    document.body.append(overlay);
  });
}
