/**
 * Nährwerte je Gericht.
 *
 * Die Rechnung ist einfach: Für jede Zutat das Produkt suchen, dessen
 * Nährwerte je 100 g holen, mit der benötigten Menge hochrechnen, summieren,
 * durch die Portionen teilen.
 *
 * **Der schwierige Teil ist die Ehrlichkeit.** Drei Dinge lassen sich nicht
 * berechnen, und alle drei ziehen die Zahl nach unten:
 *
 *   1. Frischware meldet oft keine Nährwerte — loses Gemüse, Backtheke.
 *   2. Mengen in Stück lassen sich nicht in Gramm umrechnen, ohne das
 *      Stückgewicht zu kennen. „2 Zwiebeln" bleibt unbekannt.
 *   3. Zutaten ohne Produkttreffer haben gar keine Datengrundlage.
 *
 * Deshalb liefert jede Rechnung mit, **worauf sie beruht**: wie viele Zutaten
 * eingegangen sind und welche fehlen, namentlich. Eine Kalorienangabe, die
 * drei Esslöffel Öl unterschlägt, ist schlechter als keine — aber eine, die
 * dazuschreibt, dass das Öl fehlt, ist brauchbar.
 *
 * Anders als die Einkaufsliste rechnet diese Datei **Vorratsware mit**. Salz,
 * Öl und Mehl kauft man nicht jede Woche, gegessen werden sie trotzdem.
 */

import { normalizeKey } from './translate';
import type { Ingredient, Product, Recipe } from './types';
import { toMassForIngredient } from './units';
import type { Nutrition, PriceProvider } from '../supermarkets/types';
import { findProductFor } from './shoppingList';

/** Nährwerte einer konkreten Menge — nicht je 100 g, sondern absolut. */
export interface NutritionFacts {
  kcal?: number;
  fat?: number;
  saturatedFat?: number;
  carbs?: number;
  sugar?: number;
  fiber?: number;
  protein?: number;
  salt?: number;
}

/** Warum eine Zutat nicht in die Rechnung eingehen konnte. */
export type MissingReason =
  | 'kein Produkt'
  | 'keine Nährwerte'
  | 'Menge nicht in Gramm umrechenbar';

export interface MissingIngredient {
  name: string;
  reason: MissingReason;
}

export interface RecipeNutrition {
  perServing: NutritionFacts;
  total: NutritionFacts;
  servings: number;
  /** Zutaten, die in die Rechnung eingegangen sind. */
  covered: number;
  /** Zutaten insgesamt. */
  totalIngredients: number;
  /** Was fehlt, mit Grund — die Anzeige soll es benennen können. */
  missing: MissingIngredient[];
}

const FIELDS = [
  'kcal',
  'fat',
  'saturatedFat',
  'carbs',
  'sugar',
  'fiber',
  'protein',
  'salt',
] as const;

/**
 * Rechnet Nährwerte je 100 g/ml auf eine konkrete Menge hoch.
 *
 * Gibt `null`, wenn Bedarf und Bezugsgröße nicht zusammenpassen — Gramm
 * gegen Milliliter zu rechnen wäre bei Öl und Honig deutlich daneben.
 */
export function scaleNutrition(
  nutrition: Nutrition,
  amount: number,
  dimension: 'mass' | 'volume' | 'count',
): NutritionFacts | null {
  const passt =
    (nutrition.basis === 'g' && dimension === 'mass') ||
    (nutrition.basis === 'ml' && dimension === 'volume');
  if (!passt) return null;

  const faktor = amount / 100;
  const facts: NutritionFacts = {};
  for (const feld of FIELDS) {
    const wert = nutrition[feld];
    if (typeof wert === 'number') facts[feld] = wert * faktor;
  }
  return facts;
}

/** Addiert zwei Nährwertsätze. Fehlende Felder bleiben fehlend. */
export function addFacts(a: NutritionFacts, b: NutritionFacts): NutritionFacts {
  const sum: NutritionFacts = { ...a };
  for (const feld of FIELDS) {
    const wert = b[feld];
    if (typeof wert !== 'number') continue;
    sum[feld] = (sum[feld] ?? 0) + wert;
  }
  return sum;
}

/** Rundet auf eine Nachkommastelle, Kalorien auf ganze Zahlen. */
function round(facts: NutritionFacts): NutritionFacts {
  const out: NutritionFacts = {};
  for (const feld of FIELDS) {
    const wert = facts[feld];
    if (typeof wert !== 'number') continue;
    out[feld] = feld === 'kcal' ? Math.round(wert) : Math.round(wert * 10) / 10;
  }
  return out;
}

function divide(facts: NutritionFacts, teiler: number): NutritionFacts {
  if (teiler <= 0) return facts;
  const out: NutritionFacts = {};
  for (const feld of FIELDS) {
    const wert = facts[feld];
    if (typeof wert === 'number') out[feld] = wert / teiler;
  }
  return out;
}

/**
 * Findet für eine Zutat das Produkt — bevorzugt das vom Nutzer festgelegte.
 *
 * Dieselbe Vorrangregel wie in der Einkaufsliste: Was der Nutzer gewählt hat,
 * gewinnt gegen jede Automatik. Sonst stünde im Rezept ein anderer Nährwert
 * als der des Produkts, das tatsächlich im Wagen landet.
 */
async function produktFuer(
  ing: Ingredient,
  provider: PriceProvider,
): Promise<Product | null> {
  if (ing.pinnedProduct?.provider === provider.id) {
    const fest = await provider.getProductById(ing.pinnedProduct.id);
    if (fest) return fest;
  }
  return findProductFor(ing, provider);
}

export interface NutritionOptions {
  /** Nährwerte je Produkt-ID zwischenspeichern — spart Abrufe über mehrere Rezepte. */
  cache?: Map<string, Nutrition | null>;
}

/**
 * Nährwerte eines Rezepts, gesamt und je Portion.
 *
 * Braucht Netzwerk: Für jede Zutat wird ein Produkt gesucht und dessen
 * Nährwertblatt geholt. Über mehrere Rezepte lohnt sich der `cache`.
 */
export async function nutritionForRecipe(
  recipe: Recipe,
  provider: PriceProvider,
  options: NutritionOptions = {},
): Promise<RecipeNutrition> {
  const cache = options.cache ?? new Map<string, Nutrition | null>();

  let total: NutritionFacts = {};
  let covered = 0;
  const missing: MissingIngredient[] = [];

  for (const ing of recipe.ingredients) {
    // `toMassForIngredient` rechnet Stückmengen über die Gewichtstabelle in
    // Gramm um — „2 Zwiebeln" wird zu 220 g. Ist kein Stückgewicht bekannt,
    // gibt es null statt eines geratenen Werts.
    const base = toMassForIngredient(ing.quantity, ing.id || normalizeKey(ing.name));

    if (!base || base.dimension === 'count') {
      missing.push({ name: ing.name, reason: 'Menge nicht in Gramm umrechenbar' });
      continue;
    }

    let produkt: Product | null = null;
    try {
      produkt = await produktFuer(ing, provider);
    } catch {
      // Ein Ausfall der Datenquelle ist kein Grund, die ganze Rechnung
      // abzubrechen — die Zutat fehlt dann eben, und das steht dann da.
    }
    if (!produkt) {
      missing.push({ name: ing.name, reason: 'kein Produkt' });
      continue;
    }

    let nutrition = cache.get(produkt.id);
    if (nutrition === undefined) {
      try {
        nutrition = (await provider.getNutrition?.(produkt.id)) ?? null;
      } catch {
        nutrition = null;
      }
      cache.set(produkt.id, nutrition);
    }

    if (!nutrition) {
      missing.push({ name: ing.name, reason: 'keine Nährwerte' });
      continue;
    }

    const facts = scaleNutrition(nutrition, base.amount, base.dimension);
    if (!facts) {
      missing.push({ name: ing.name, reason: 'keine Nährwerte' });
      continue;
    }

    total = addFacts(total, facts);
    covered++;
  }

  const servings = Math.max(1, recipe.servings);

  return {
    total: round(total),
    perServing: round(divide(total, servings)),
    servings,
    covered,
    totalIngredients: recipe.ingredients.length,
    missing,
  };
}

/**
 * Kurzfassung für die Oberfläche: „7 von 10 Zutaten".
 *
 * Bewusst keine Prozentangabe. „70 % abgedeckt" klingt nach Genauigkeit;
 * „7 von 10 Zutaten" sagt, was wirklich gemeint ist.
 */
export function coverageLabel(n: RecipeNutrition): string {
  return `${n.covered} von ${n.totalIngredients} Zutaten`;
}

/**
 * Taugt die Rechnung überhaupt zur Anzeige?
 *
 * Unter der Hälfte der Zutaten ist die Zahl eher irreführend als hilfreich —
 * dann zeigt die Oberfläche besser gar nichts als eine Kalorienangabe, die
 * um den Faktor zwei danebenliegt.
 */
export function isTrustworthy(n: RecipeNutrition): boolean {
  return n.totalIngredients > 0 && n.covered / n.totalIngredients >= 0.5;
}
