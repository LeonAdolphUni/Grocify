/**
 * Einheiten und Mengenumrechnung.
 *
 * Reine Logik: kein Netzwerk, keine UI, keine React-Abhängigkeit.
 * Damit ist dieser Teil vollständig testbar, ohne die App zu starten.
 */

/** Basisdimension, auf die eine Einheit zurückgeführt werden kann. */
export type Dimension = 'mass' | 'volume' | 'count';

export type Unit =
  // Masse
  | 'g'
  | 'kg'
  // Volumen
  | 'ml'
  | 'l'
  | 'EL' // Esslöffel
  | 'TL' // Teelöffel
  // Anzahl
  | 'Stueck'
  // Kontextabhängig – siehe AMBIGUOUS_UNITS
  | 'Prise'
  | 'Msp' // Messerspitze
  | 'Bund'
  | 'Zehe'
  | 'Packung'
  | 'Dose';

export interface Quantity {
  amount: number;
  unit: Unit;
}

/** Menge, die auf eine Basiseinheit (g, ml oder Stück) heruntergerechnet wurde. */
export interface BaseQuantity {
  amount: number;
  dimension: Dimension;
}

/**
 * Umrechnungsfaktoren auf die jeweilige Basiseinheit.
 *
 * EL/TL sind hier bewusst als Volumen geführt (15 ml / 5 ml). Das ist die
 * übliche Konvention; bei Trockenware weicht das reale Gewicht je nach Zutat
 * deutlich ab (1 EL Mehl ≈ 9 g, 1 EL Zucker ≈ 12 g). Wer Gramm braucht, muss
 * über die zutatenspezifische Dichte gehen – siehe `INGREDIENT_DENSITY` weiter unten.
 */
const CONVERSIONS: Record<string, { factor: number; dimension: Dimension }> = {
  g: { factor: 1, dimension: 'mass' },
  kg: { factor: 1000, dimension: 'mass' },
  ml: { factor: 1, dimension: 'volume' },
  l: { factor: 1000, dimension: 'volume' },
  EL: { factor: 15, dimension: 'volume' },
  TL: { factor: 5, dimension: 'volume' },
  Stueck: { factor: 1, dimension: 'count' },
};

/**
 * Einheiten, die sich ohne Kenntnis der konkreten Zutat NICHT auflösen lassen.
 *
 * "1 Bund Petersilie" (≈ 30 g) und "1 Bund Möhren" (≈ 500 g) sind beides
 * "1 Bund". Diese Einheiten brauchen eine zutatenspezifische Tabelle; sie
 * einfach mit einem Durchschnittswert zu belegen, produziert stillschweigend
 * falsche Einkaufsmengen.
 */
export const AMBIGUOUS_UNITS: readonly Unit[] = [
  'Prise',
  'Msp',
  'Bund',
  'Zehe',
  'Packung',
  'Dose',
] as const;

export function isAmbiguous(unit: Unit): boolean {
  return AMBIGUOUS_UNITS.includes(unit);
}

/**
 * Rechnet eine Menge auf ihre Basiseinheit herunter.
 *
 * Gibt `null` zurück, wenn die Einheit ohne Zutatenkontext nicht auflösbar ist.
 * Der Aufrufer muss diesen Fall behandeln – bewusst kein stiller Schätzwert.
 */
export function toBase(q: Quantity): BaseQuantity | null {
  const conv = CONVERSIONS[q.unit];
  if (!conv) return null;
  return { amount: q.amount * conv.factor, dimension: conv.dimension };
}

/**
 * Zutatenspezifische Gewichte für mehrdeutige Einheiten, in Gramm.
 *
 * Bewusst klein gehalten und handgepflegt: Diese Tabelle wächst mit den
 * Rezepten, die tatsächlich auftreten. Sprint 6 baut sie aus.
 * Schlüssel sind kanonische Zutaten-IDs, nicht Anzeigenamen.
 */
export const AMBIGUOUS_WEIGHTS: Record<string, Partial<Record<Unit, number>>> = {
  knoblauch: { Zehe: 5 },
  petersilie: { Bund: 30 },
  moehre: { Bund: 500, Stueck: 80 },
  salz: { Prise: 0.4, Msp: 0.5 },
  pfeffer: { Prise: 0.3, Msp: 0.4 },
  zwiebel: { Stueck: 110 },
  ei: { Stueck: 58 },
};

/**
 * Wie `toBase`, nutzt aber die zutatenspezifische Tabelle für mehrdeutige Einheiten.
 *
 * @param ingredientId Kanonische Zutaten-ID (z. B. "knoblauch"), nicht der Anzeigename.
 */
export function toBaseForIngredient(
  q: Quantity,
  ingredientId: string,
): BaseQuantity | null {
  const direct = toBase(q);
  if (direct) return direct;

  const grams = AMBIGUOUS_WEIGHTS[ingredientId]?.[q.unit];
  if (grams === undefined) return null;

  return { amount: q.amount * grams, dimension: 'mass' };
}

/** Skaliert eine Menge auf eine andere Portionszahl. */
export function scale(q: Quantity, fromServings: number, toServings: number): Quantity {
  if (fromServings <= 0) throw new Error('fromServings muss > 0 sein');
  return { ...q, amount: (q.amount * toServings) / fromServings };
}

/**
 * Formatiert eine Menge für die Anzeige.
 * Rundet auf zwei Nachkommastellen und schneidet überflüssige Nullen ab.
 */
export function formatQuantity(q: Quantity): string {
  const rounded = Math.round(q.amount * 100) / 100;
  const label = q.unit === 'Stueck' ? 'Stück' : q.unit;
  return `${rounded} ${label}`;
}
