import { useIonLoading, useIonToast } from '@ionic/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/AppContext';
import { inviteUrl } from '../../core/inviteLink';
import { shareText } from '../../native/share';
import { AccountSetupModal } from './AccountSetupModal';
import { sharingErrorText } from './errors';
import { InviteSheet } from './InviteSheet';

/**
 * Invite / join, the Esstisch way: the first time, a small sheet asks for the name and the terms,
 * then the account is created; afterwards it goes straight through.
 */
export function useSharing() {
  const { t } = useTranslation();
  const { account } = useApp();
  const [toast] = useIonToast();
  const [loading, dismissLoading] = useIonLoading();
  const [setup, setSetup] = useState<'invite' | 'join' | null>(null);
  const after = useRef<(() => void) | null>(null);
  const [invite, setInvite] = useState<{ code: string; expiresAt: string; vacationName: string } | null>(null);

  const say = (message: string, color?: string) => void toast({ message, duration: 2500, position: 'top', color });

  const withAccount = async (purpose: 'invite' | 'join', fn: () => void) => {
    if (account.online && (await account.termsAccepted())) return fn();
    after.current = fn;
    setSetup(purpose);
  };

  const createInvite = (vacationId: string, vacationName: string) =>
    void withAccount('invite', () => {
      void (async () => {
        await loading({ message: t('sharing.preparing') });
        try {
          const r = await account.createInvite(vacationId);
          setInvite({ ...r, vacationName });
        } catch (e) {
          say(sharingErrorText(e), 'danger');
        } finally {
          await dismissLoading();
        }
      })();
    });

  /** Join with a code; `onJoined` gets the vacation id. */
  const join = (code: string, onJoined: (vacationId: string) => void) =>
    void withAccount('join', () => {
      void (async () => {
        await loading({ message: t('sharing.joining') });
        try {
          const r = await account.acceptInvite(code);
          await dismissLoading();
          say(t('sharing.joined', { vacation: r.vacationName }));
          onJoined(r.vacationId);
        } catch (e) {
          await dismissLoading();
          say(sharingErrorText(e), 'danger');
        }
      })();
    });

  const shareInvite = async () => {
    if (!invite) return;
    const r = await shareText({
      title: t('sharing.inviteShareTitle'),
      text: t('sharing.inviteShareText', { vacation: invite.vacationName, code: invite.code }),
      url: inviteUrl(invite.code),
    });
    if (r === 'copied') say(t('sharing.linkCopied'));
  };

  const ui = (
    <>
      <AccountSetupModal
        isOpen={setup !== null}
        purpose={setup ?? 'invite'}
        onClose={() => setSetup(null)}
        onReady={() => {
          setSetup(null);
          const fn = after.current;
          after.current = null;
          fn?.();
        }}
      />
      <InviteSheet invite={invite} onShare={() => void shareInvite()} onClose={() => setInvite(null)} />
    </>
  );

  return { createInvite, join, ui };
}
