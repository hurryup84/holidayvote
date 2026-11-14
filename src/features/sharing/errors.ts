import i18n from 'i18next';
import { AccountError } from '../../data/sync/account';

export function sharingErrorText(e: unknown): string {
  console.error('[sharing]', e);
  return e instanceof AccountError ? i18n.t(`sharing.error.${e.code}`) : i18n.t('sharing.error.failed');
}
