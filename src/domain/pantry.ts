/**
 * Der Vorrat: was schon zu Hause steht.
 *
 * Ohne ihn kauft die App jede Woche 500 g Mehl, obwohl noch 800 g im Schrank
 * stehen. Der Wochenplan optimiert bisher nur *innerhalb* eines Einkaufs —
 * dass zwischen zwei Einkäufen etwas übrig bleibt, ist ihm nicht bekannt.
 *
 * Bewusst getrennt von der Vorratsware-Erkennung in `translate.ts`: Die sagt
 * „Salz hat man üblicherweise", das hier sagt „ich habe genau 240 g Reis".
 * Das eine ist eine Annahme über alle Haushalte, das andere eine Angabe über
 * diesen.
 *
 * **Abgezogen wird nur, was sich vergleichen lässt.** Stehen 2 Zwiebeln im
 * Vorrat und das Rezept braucht 300 g, wird nichts abgezogen, solange kein
 * Stückgewicht bekannt ist — lieber einmal zu viel kaufen als mit zu wenig
 * am Herd stehen.
 */

import { normalizeKey } from './translate';
import type { Ingredient } from './types';
import { toBaseForIngredient, type Dimension } from './units';
import type { Quantity } from './units';

export interface PantryItem {
  /** Kanonischer Schlüssel, wie bei Zutaten: normalisierter deutscher Name. */
  id: string;
  name: string;
  quantity: Quantity;
  /**
   * Wann zuletzt bestätigt. Ein Vorrat, den niemand pflegt, wird schnell
   * zur Lüge — die Oberfläche kann damit auf alte Einträge hinweisen.
   */
  updatedAt: string;
  /** Freitext des Nutzers, etwa „im Gefrierfach" oder „läuft bald ab". */
  note?: string;
}

/** Ergebnis der Verrechnung einer Zutat gegen den Vorrat. */
export interface PantryDeduction {
  /** Was nach Abzug noch gekauft werden muss. */
  remaining: Quantity;
  /** Wie viel aus dem Vorrat gedeckt wurde, in der Einheit der Zutat. */
  covered: number;
  /** Vollständig gedeckt — die Zeile kann von der Liste verschwinden. */
  fullyCovered: boolean;
  /** Warum nichts abgezogen wurde, wenn nichts abgezogen wurde. */
  skipped?: 'nicht im Vorrat' | 'Mengen nicht vergleichbar';
}

/** Schlüssel für den Abgleich — dieselbe Normalisierung wie überall. */
export function pantryKey(name: string): string {
  return normalizeKey(name);
}

/**
 * Deutsche Pluralendungen, die an den Wortstamm treten.
 *
 * Bewusst nur die angehängten: Umlautplurale („Apfel" → „Äpfel") ändern den
 * Stamm und stehen deshalb unten als Ausnahmen.
 */
const PLURAL_ENDUNGEN = ['n', 'en', 'e', 'er', 's', 'nen'];

/**
 * Wortpaare, die sich nicht über eine Endung ableiten lassen.
 *
 * Entweder weil der Stamm sich ändert (Umlaut) oder weil das Wort zu kurz
 * für die Endungsregel ist — „ei" hat nur zwei Buchstaben, und bei so
 * kurzen Stämmen träfe die Regel auch auf „Eis" zu.
 */
const UNREGELMAESSIG: Record<string, string> = {
  ei: 'eier',
  apfel: 'aepfel',
  wurst: 'wuerste',
  saft: 'saefte',
  soss: 'soossen',
  nuss: 'nuesse',
  glas: 'glaeser',
  dose: 'dosen',
};

/**
 * Meinen zwei Namen dieselbe Zutat?
 *
 * Der Grund für diese Funktion ist ein echter Fehler: Wer „2 Zwiebeln" in
 * den Vorrat tippt — der natürliche deutsche Plural —, dessen Eintrag lief
 * unter `zwiebeln`. Im Rezept steht aber `zwiebel`, weil Chefkoch die
 * Einzahl liefert. Der Abgleich fand nichts, und der Vorrat wurde
 * kommentarlos ignoriert.
 *
 * Verglichen wird deshalb Stamm gegen Stamm plus bekannte Pluralendung.
 * Mindestens drei Zeichen Stamm, sonst würde „Eis" zum Plural von „Ei".
 */
export function sameIngredientName(a: string, b: string): boolean {
  const ka = normalizeKey(a);
  const kb = normalizeKey(b);
  if (ka === kb) return true;

  if (UNREGELMAESSIG[ka] === kb || UNREGELMAESSIG[kb] === ka) return true;

  const [kurz, lang] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  if (kurz.length < 3 || !lang.startsWith(kurz)) return false;

  return PLURAL_ENDUNGEN.includes(lang.slice(kurz.length));
}

/**
 * Zieht den Vorrat von einer benötigten Menge ab.
 *
 * Gerechnet wird über die Basiseinheit, damit „0,5 l Milch" im Rezept gegen
 * „300 ml" im Vorrat aufgeht. Passen die Dimensionen nicht zusammen — Stück
 * gegen Gramm —, wird **nichts** abgezogen und der Grund vermerkt.
 */
export function deductFromPantry(
  ingredient: Pick<Ingredient, 'id' | 'name' | 'quantity'>,
  pantry: PantryItem[],
): PantryDeduction {
  const key = ingredient.id || pantryKey(ingredient.name);
  // Über den Namen vergleichen, nicht nur über den Schlüssel: „Zwiebeln"
  // im Vorrat und „Zwiebel" im Rezept sind dieselbe Zutat.
  const stock = pantry.find(
    (p) =>
      p.id === key ||
      sameIngredientName(p.name, ingredient.name) ||
      sameIngredientName(p.id, key),
  );

  if (!stock) {
    return { remaining: ingredient.quantity, covered: 0, fullyCovered: false, skipped: 'nicht im Vorrat' };
  }

  const need = toBaseForIngredient(ingredient.quantity, key);
  const have = toBaseForIngredient(stock.quantity, key);

  if (!need || !have || need.dimension !== have.dimension) {
    return {
      remaining: ingredient.quantity,
      covered: 0,
      fullyCovered: false,
      skipped: 'Mengen nicht vergleichbar',
    };
  }

  if (have.amount >= need.amount) {
    return {
      remaining: { amount: 0, unit: ingredient.quantity.unit },
      covered: ingredient.quantity.amount,
      fullyCovered: true,
    };
  }

  // Teilweise gedeckt: Der Rest wird in der Basiseinheit weitergereicht,
  // damit keine krummen Umrechnungen entstehen („0,17 l" statt „170 ml").
  const restBase = need.amount - have.amount;
  const anteilGedeckt = have.amount / need.amount;

  return {
    remaining: { amount: restBase, unit: baseUnit(need.dimension) },
    covered: Math.round(ingredient.quantity.amount * anteilGedeckt * 100) / 100,
    fullyCovered: false,
  };
}

function baseUnit(dimension: Dimension): Quantity['unit'] {
  return dimension === 'mass' ? 'g' : dimension === 'volume' ? 'ml' : 'Stueck';
}

/**
 * Verbucht einen Einkauf im Vorrat.
 *
 * Nach dem Einkauf steht mehr im Schrank als vorher — sonst müsste man den
 * Vorrat von Hand nachtragen, und ein Vorrat, den man von Hand pflegt,
 * pflegt niemand.
 */
export function addToPantry(pantry: PantryItem[], name: string, quantity: Quantity): PantryItem[] {
  const key = pantryKey(name);
  const jetzt = new Date().toISOString();
  const vorhanden = pantry.find((p) => p.id === key);

  if (!vorhanden) {
    return [...pantry, { id: key, name, quantity, updatedAt: jetzt }];
  }

  const alt = toBaseForIngredient(vorhanden.quantity, key);
  const neu = toBaseForIngredient(quantity, key);

  // Nicht vergleichbar? Dann die neue Angabe nehmen statt zu addieren —
  // „2 Stück" und „500 g" zu summieren ergäbe eine Fantasiezahl.
  const zusammen =
    alt && neu && alt.dimension === neu.dimension
      ? { amount: alt.amount + neu.amount, unit: baseUnit(alt.dimension) }
      : quantity;

  return pantry.map((p) => (p.id === key ? { ...p, quantity: zusammen, updatedAt: jetzt } : p));
}

/** Entfernt leere Einträge — ein Vorrat mit „0 g Mehl" ist kein Vorrat. */
export function prunePantry(pantry: PantryItem[]): PantryItem[] {
  return pantry.filter((p) => p.quantity.amount > 0);
}

/** Wie alt ist der älteste Eintrag, in Tagen? Für den Hinweis „lange nicht gepflegt". */
export function stalestDays(pantry: PantryItem[], now = Date.now()): number | null {
  if (pantry.length === 0) return null;
  const aeltester = pantry.reduce((min, p) => Math.min(min, Date.parse(p.updatedAt) || now), now);
  return Math.floor((now - aeltester) / 86_400_000);
}
