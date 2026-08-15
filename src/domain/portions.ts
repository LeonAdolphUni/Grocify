/**
 * Portionen umrechnen.
 *
 * Grocify ist für **eine Person** gebaut. Rezepte sind es fast nie: Chefkoch
 * liefert vier, sechs oder acht Portionen, weil Rezepte für Familien
 * geschrieben werden. Ohne Umrechnung kauft die App jede Woche den vierfachen
 * Bedarf ein.
 *
 * ⚠️ **Das hat einen Preis, und der gehört benannt.** Ein Viertel-Ei kann man
 * nicht kaufen, ein Sechstel-Kürbis auch nicht. Die Packung bleibt dieselbe,
 * nur der Anteil, den du davon brauchst, wird kleiner — die Verwertungsquote
 * sinkt also, je kleiner man rechnet. Das ist kein Fehler der Umrechnung,
 * sondern die Wirklichkeit des Einkaufens für eine Person. Deshalb ist die
 * Zielportionszahl einstellbar: Wer zwei Portionen kocht und zweimal isst,
 * wirft weniger weg.
 */

import type { Ingredient, Recipe } from './types';
import { scale } from './units';

/** Standard: eine Person. Der ganze Zweck dieser App. */
export const DEFAULT_SERVINGS = 1;

/**
 * Rechnet ein Rezept auf eine andere Portionszahl um.
 *
 * Das Original bleibt unangetastet — die Umrechnung passiert beim *Benutzen*
 * des Rezepts, nicht beim Speichern. Ein importiertes Rezept behält damit
 * seine Herkunftsangabe („6 Portionen laut Chefkoch"), und wer die
 * Zielportionen später ändert, verliert nichts.
 *
 * Mehrdeutige Einheiten werden mitskaliert, obwohl sie sich nicht in Gramm
 * auflösen lassen: „2 Zehen Knoblauch" für vier Portionen sind eine halbe
 * Zehe für eine. Das ist ehrlicher als sie unverändert zu lassen — beim
 * Einkauf rundet die Packungsrechnung ohnehin auf.
 */
export function scaleRecipe(recipe: Recipe, toServings: number): Recipe {
  const ziel = Math.max(1, Math.round(toServings));
  const von = Math.max(1, recipe.servings);
  if (ziel === von) return recipe;

  return {
    ...recipe,
    servings: ziel,
    ingredients: recipe.ingredients.map((ing) => scaleIngredient(ing, von, ziel)),
    /** Woher die Mengen stammen — die Anzeige soll es sagen können. */
    scaledFrom: von,
  };
}

function scaleIngredient(ing: Ingredient, von: number, ziel: number): Ingredient {
  const menge = scale(ing.quantity, von, ziel);

  return {
    ...ing,
    quantity: { ...menge, amount: roundSensibly(menge.amount) },
    // rawText beschreibt die *ursprüngliche* Zeile („500 g Hackfleisch").
    // Nach der Umrechnung stimmt sie nicht mehr; sie wird deshalb ergänzt
    // statt ersetzt, damit man nachvollziehen kann, woher die Zahl kommt.
    rawText: ing.rawText,
  };
}

/**
 * Rundet Mengen auf etwas, das man aufschreiben würde.
 *
 * 41,666… g Mehl ist rechnerisch richtig und praktisch albern. Gerundet wird
 * abhängig von der Größenordnung: große Mengen auf ganze Zahlen, kleine auf
 * zwei Nachkommastellen — sonst würde aus „0,25 Zehen" eine Null.
 */
export function roundSensibly(amount: number): number {
  if (amount >= 100) return Math.round(amount);
  if (amount >= 10) return Math.round(amount * 10) / 10;
  if (amount >= 1) return Math.round(amount * 100) / 100;
  return Math.round(amount * 1000) / 1000;
}

/**
 * Rechnet alle Rezepte einer Auswahl auf die Zielportionszahl um.
 *
 * Wird vor dem Bauen der Einkaufsliste angewendet: Erst umrechnen, dann
 * zusammenfassen. Andersherum würden Mengen aus Rezepten mit
 * unterschiedlichen Portionszahlen falsch addiert.
 */
export function scaleAll(recipes: Recipe[], toServings: number): Recipe[] {
  return recipes.map((r) => scaleRecipe(r, toServings));
}

/**
 * Beschreibt die Umrechnung im Klartext.
 *
 * „6 Portionen → 1" ist verständlicher als eine stille Änderung der Zahlen.
 * Gibt `null`, wenn nichts umgerechnet wurde.
 */
export function scalingLabel(recipe: Recipe): string | null {
  if (!recipe.scaledFrom || recipe.scaledFrom === recipe.servings) return null;
  return `${recipe.scaledFrom} Portionen im Original → ${recipe.servings}`;
}
