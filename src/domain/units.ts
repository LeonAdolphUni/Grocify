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
  knoblauch: { Zehe: 5, Stueck: 5 },
  knoblauchzehe: { Zehe: 5, Stueck: 5 },
  petersilie: { Bund: 30 },
  moehre: { Bund: 500, Stueck: 80 },
  karotte: { Bund: 500, Stueck: 80 },
  salz: { Prise: 0.4, Msp: 0.5 },
  pfeffer: { Prise: 0.3, Msp: 0.4 },
  zwiebel: { Stueck: 110 },
  ei: { Stueck: 58 },
  eier: { Stueck: 58 },

  // Stückgewichte für die Nährwertrechnung. Ohne sie fällt jede Zutat
  // heraus, die in Stück angegeben ist — und das sind in echten Rezepten
  // die meisten Gemüsezeilen. Werte sind mittlere Handelsgrößen.
  paprika: { Stueck: 150 },
  tomate: { Stueck: 100 },
  kartoffel: { Stueck: 120 },
  gurke: { Stueck: 400 },
  zucchini: { Stueck: 250 },
  aubergine: { Stueck: 300 },
  zitrone: { Stueck: 100 },
  limette: { Stueck: 65 },
  apfel: { Stueck: 150 },
  banane: { Stueck: 120 },
  lauch: { Stueck: 250 },
  fenchel: { Stueck: 300 },
  schalotte: { Stueck: 35 },
  fruehlingszwiebel: { Bund: 100, Stueck: 20 },
  basilikum: { Bund: 25 },
  schnittlauch: { Bund: 25 },
  dill: { Bund: 25 },
  minze: { Bund: 25 },
  koriander: { Bund: 25 },
  thymian: { Bund: 20 },
  rosmarin: { Bund: 20 },
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

/**
 * Dichte in Gramm je Milliliter — für Zutaten, die in Löffeln gemessen,
 * aber in Gramm ausgewiesen werden.
 *
 * EL und TL sind hier als Volumen geführt (15 ml / 5 ml), das ist die
 * übliche Konvention. Nährwerttabellen rechnen dagegen je 100 **Gramm**.
 * Ohne Dichte fällt „1 TL Paprikapulver" damit aus jeder Nährwertrechnung,
 * obwohl beides bekannt ist.
 *
 * Die Werte sind Schüttdichten, keine Stoffdichten: Ein Esslöffel Mehl wiegt
 * etwa 9 g, nicht 15 — Mehl ist locker. Genau deshalb steht hier eine
 * eigene Tabelle statt eines Umrechnungsfaktors.
 */
export const INGREDIENT_DENSITY: Record<string, number> = {
  mehl: 0.6,
  weizenmehl: 0.6,
  dinkelmehl: 0.6,
  staerke: 0.6,
  zucker: 0.8,
  puderzucker: 0.55,
  salz: 1.2,
  pfeffer: 0.45,
  paprikapulver: 0.45,
  zimt: 0.45,
  muskat: 0.5,
  oregano: 0.2,
  thymian: 0.2,
  currypulver: 0.45,
  backpulver: 0.9,
  haferflocken: 0.4,
  semmelbroesel: 0.4,
  reis: 0.85,
  honig: 1.4,
  tomatenmark: 1.1,
  senf: 1.05,
  // Öl und Essig liegen nah an Wasser — trotzdem eintragen, damit „2 EL Öl"
  // rechenbar wird, ohne dass jemand 1,0 raten muss.
  oel: 0.92,
  olivenoel: 0.92,
  sonnenblumenoel: 0.92,
  essig: 1.01,
};

/**
 * Wie `toBaseForIngredient`, rechnet aber **Stückmengen zusätzlich in Gramm** um.
 *
 * Der Unterschied ist wichtig genug für eine eigene Funktion:
 *
 * Für den **Einkauf** ist „2 Zwiebeln" eine Stückzahl und soll es bleiben —
 * man kauft Zwiebeln in Stück oder im Netz, nicht in Gramm. `toBase` gibt
 * deshalb `count` zurück, und die Packungsrechnung stimmt.
 *
 * Für die **Nährwerte** ist „2 Zwiebeln" dagegen wertlos: Nährwerte gibt es
 * nur je 100 g. Hier wird die Stückzahl über die Gewichtstabelle in Masse
 * übersetzt — und wenn kein Stückgewicht bekannt ist, gibt es `null` statt
 * eines geratenen Werts.
 */
export function toMassForIngredient(q: Quantity, ingredientId: string): BaseQuantity | null {
  const base = toBaseForIngredient(q, ingredientId);

  if (base?.dimension === 'mass') return base;

  // Volumen in Masse, wenn die Dichte bekannt ist: „1 TL Paprikapulver"
  // sind 5 ml mal 0,45 g/ml, also 2,25 g. Ist sie unbekannt, bleibt es
  // Volumen — Wasser und Milch will man nicht in Gramm sehen.
  if (base?.dimension === 'volume') {
    const dichte = INGREDIENT_DENSITY[ingredientId];
    if (dichte === undefined) return base;
    return { amount: base.amount * dichte, dimension: 'mass' };
  }

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
