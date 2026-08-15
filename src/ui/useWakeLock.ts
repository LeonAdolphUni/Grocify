/**
 * Hält den Bildschirm wach, solange die Einkaufsliste offen ist.
 *
 * Im Laden hält man das Telefon in einer Hand und schiebt mit der anderen.
 * Ein Bildschirm, der nach dreißig Sekunden abdunkelt, zwingt bei jedem
 * zweiten Regal zum Entsperren — mit dem Einkaufswagen vor sich.
 *
 * Nutzt die Wake-Lock-API des Browsers. Sie ist nicht überall vorhanden
 * (Safari kann sie erst seit 16.4) und der Browser darf sie jederzeit
 * wieder einziehen — beides ist hier kein Fehlerfall, sondern der
 * Normalzustand: Dann verhält sich die App wie vorher.
 *
 * Der `visibilitychange`-Teil ist nicht optional: Wechselt man kurz die App,
 * gibt der Browser die Sperre ab und **gibt sie nicht von selbst zurück**.
 * Ohne das Nachfordern hält der Bildschirm genau bis zum ersten Blick auf
 * eine Nachricht.
 */

import { useEffect } from 'react';

interface WakeLockSentinel {
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}

interface WakeLockNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return;

    const wakeLock = (navigator as unknown as WakeLockNavigator).wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let abgebrochen = false;

    const anfordern = async () => {
      try {
        sentinel = await wakeLock.request('screen');
      } catch {
        // Abgelehnt — etwa bei niedrigem Akkustand. Kein Grund für eine
        // Meldung: Der Nutzer verliert nichts außer dem Komfort.
      }
    };

    const beiSichtbarkeit = () => {
      if (!abgebrochen && document.visibilityState === 'visible') void anfordern();
    };

    void anfordern();
    document.addEventListener('visibilitychange', beiSichtbarkeit);

    return () => {
      abgebrochen = true;
      document.removeEventListener('visibilitychange', beiSichtbarkeit);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
