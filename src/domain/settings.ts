/**
 * Einstellungen.
 *
 * Bewusst winzig: Eine App für eine Person braucht keine Einstellungsseite.
 * Was hier steht, muss eine Entscheidung sein, die die App nicht selbst
 * treffen kann.
 */

export interface Settings {
  /**
   * Auf wie viele Portionen jedes Rezept umgerechnet wird.
   *
   * Standard ist 1 — Grocify ist für eine Person gebaut, Rezepte sind es
   * nie. Wer zwei Portionen kocht und zweimal isst, stellt hier 2 ein und
   * wirft weniger weg: Die Packungsgrößen im Laden ändern sich nicht,
   * nur der Anteil, den man davon braucht.
   */
  servingsPerMeal: number;
  /**
   * Wann der Vorrat zuletzt durchgesehen wurde, als ISO-Datum.
   *
   * Leer heißt: noch nie. Daraus entsteht die wöchentliche Erinnerung —
   * ein Vorrat, den niemand pflegt, führt die Einkaufsliste in die Irre,
   * und das fällt erst im Laden auf.
   */
  pantryReviewedAt?: string;
}

/**
 * Ist der Vorrat wieder fällig?
 *
 * Fällig ist er ab Montag, wenn seit dem letzten Durchsehen ein neuer
 * Montag angebrochen ist. Montag, weil die Woche dann geplant wird — die
 * Erinnerung kommt, wenn sie etwas nützt, nicht am Sonntagabend.
 *
 * Wer nie durchgesehen hat, ist ab dem ersten Montag fällig; ohne diese
 * Regel bekäme ein frisch eingerichteter Vorrat sofort eine Mahnung.
 */
export function isPantryReviewDue(settings: Settings, now = new Date()): boolean {
  const letzterMontag = startOfWeek(now);
  if (now < letzterMontag) return false;

  if (!settings.pantryReviewedAt) return true;
  const geprueft = new Date(settings.pantryReviewedAt);
  if (Number.isNaN(geprueft.getTime())) return true;

  return geprueft < letzterMontag;
}

/** Montag 00:00 der laufenden Woche. */
export function startOfWeek(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  // getDay(): Sonntag ist 0. Der Montag davor liegt sechs Tage zurück.
  const tageSeitMontag = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - tageSeitMontag);
  return d;
}

export const DEFAULT_SETTINGS: Settings = { servingsPerMeal: 1 };
