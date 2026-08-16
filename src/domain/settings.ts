/**
 * Einstellungen.
 *
 * Bewusst winzig: Eine App für eine Person braucht keine Einstellungsseite.
 * Was hier steht, muss eine Entscheidung sein, die die App nicht selbst
 * treffen kann.
 */

import type { SearchLanguage } from './searchLanguage';

export interface Settings {
  /**
   * Wann der Vorrat zuletzt durchgesehen wurde, als ISO-Datum.
   *
   * Leer heißt: noch nie. Daraus entsteht die wöchentliche Erinnerung —
   * ein Vorrat, den niemand pflegt, führt die Einkaufsliste in die Irre,
   * und das fällt erst im Laden auf.
   */
  pantryReviewedAt?: string;
  /**
   * In welcher Sprache man Rezepte sucht.
   *
   * Allerhande ist niederländisch. Wer „Eiersalat" eingibt, sucht dort nach
   * einem Wort, das es nicht gibt — deshalb wird der Begriff vor der Suche
   * übersetzt. Standard ist Deutsch, weil die App auf Deutsch läuft.
   */
  searchLanguage?: SearchLanguage;
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

export const DEFAULT_SETTINGS: Settings = { searchLanguage: 'de' };
