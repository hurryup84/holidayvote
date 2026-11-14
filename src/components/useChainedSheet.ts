import { useIonActionSheet } from '@ionic/react';
import { useRef } from 'react';

type SheetOptions = Parameters<ReturnType<typeof useIonActionSheet>[0]>[0] & object;

/**
 * Action sheets that lead to a second step (e.g. "Report content" → reason). useIonActionSheet ignores
 * present() while a sheet is still closing – on iOS a fixed delay was sometimes too short and the
 * second sheet silently never appeared. `then(fn)` as a button handler runs `fn` once this sheet has
 * fully closed.
 */
export function useChainedSheet() {
  const [present] = useIonActionSheet();
  const next = useRef<(() => void) | null>(null);
  const sheet = (opts: SheetOptions) =>
    void present({
      ...opts,
      onDidDismiss: (e) => {
        opts.onDidDismiss?.(e);
        const n = next.current;
        next.current = null;
        // Ionic clears its overlay reference only after this callback → defer one tick.
        if (n) window.setTimeout(n, 0);
      },
    });
  const then = (fn: () => void) => () => {
    next.current = fn;
  };
  return { sheet, then };
}
