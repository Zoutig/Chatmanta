// Sessievlag voor de intro-melding van de publieke demo (app/voorbeeld/_notice).
// Puur en fouttolerant: geblokkeerde of ontbrekende opslag gooit nooit, en telt als
// "nog niet gezien" (de melding verschijnt dan opnieuw; de pagina werkt gewoon).

export const DEMO_NOTICE_KEY = 'chatmanta-voorbeeld:intro-gezien';

type MinimalStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readNoticeSeen(storage: MinimalStorage | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(DEMO_NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeNoticeSeen(storage: MinimalStorage | null): void {
  if (!storage) return;
  try {
    storage.setItem(DEMO_NOTICE_KEY, '1');
  } catch {
    // Quota of geblokkeerd: dan komt de melding bij de volgende pageload terug.
  }
}
