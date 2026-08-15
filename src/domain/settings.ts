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
}

export const DEFAULT_SETTINGS: Settings = { servingsPerMeal: 1 };
