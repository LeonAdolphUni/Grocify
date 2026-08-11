/**
 * Reste verwerten: Welches Rezept würde aufbrauchen, was übrig bleibt?
 *
 * Die Verwertungsquote anzuzeigen ist die halbe Miete — sie sagt dem Nutzer,
 * dass 700 g Reis übrig bleiben, aber nicht, was er dagegen tun soll. Diese
 * Datei schließt die Lücke: Sie durchsucht die vorhandenen Rezepte nach
 * solchen, die genau diese Reste verbrauchen würden.
 *
 * Rein lokal, ohne Netzwerk: Es wird nur gerechnet, was ohnehin schon
 * bekannt ist.
 */

import type { Recipe, ShoppingList } from './types';
import { normalizeKey } from './translate';
import { toBaseForIngredient, type Dimension } from './units';

interface LeftoverEntry {
  name: string;
  amount: number;
  dimension: Dimension;
  value: number;
}

/** Was ein vorgeschlagenes Rezept von einem konkreten Rest verbrauchen würde. */
export interface LeftoverUse {
  ingredientName: string;
  /** Anteil des Rests, den dieses Rezept verbraucht (0…1). */
  share: number;
}

export interface RecipeSuggestion {
  recipe: Recipe;
  uses: LeftoverUse[];
  /** Geldwert der Reste, die dieses Rezept verwerten würde. */
  value: number;
}

/** Sammelt die Reste einer Einkaufsliste, nach kanonischer Zutat. */
function collectLeftovers(list: ShoppingList): Map<string, LeftoverEntry> {
  const map = new Map<string, LeftoverEntry>();

  for (const item of list.items) {
    if (!item.leftover || item.leftover.amount <= 0) continue;
    const base = toBaseForIngredient(item.leftover, item.ingredient.id);
    if (!base) continue;

    map.set(item.ingredient.id || normalizeKey(item.ingredient.name), {
      name: item.ingredient.name,
      amount: base.amount,
      dimension: base.dimension,
      value: item.leftoverValue,
    });
  }
  return map;
}

/**
 * Schlägt Rezepte vor, die die Reste der Liste verwerten würden.
 *
 * Bewertet nach Geldwert, nicht nach Menge: 700 g Reis für 40 Cent
 * aufzubrauchen ist weniger wert als 95 g Parmesan für 4,32 €.
 *
 * @param candidates Alle bekannten Rezepte. Bereits eingeplante werden
 *                   übersprungen — ein Vorschlag, den man schon kocht,
 *                   hilft niemandem.
 */
export function suggestRecipesForLeftovers(
  list: ShoppingList,
  candidates: Recipe[],
  limit = 3,
): RecipeSuggestion[] {
  const leftovers = collectLeftovers(list);
  if (leftovers.size === 0) return [];

  const alreadyPlanned = new Set(list.recipes.map((r) => r.id));
  const suggestions: RecipeSuggestion[] = [];

  for (const recipe of candidates) {
    if (alreadyPlanned.has(recipe.id)) continue;

    const uses: LeftoverUse[] = [];
    let value = 0;

    for (const ing of recipe.ingredients) {
      if (ing.isPantryStaple) continue;
      const key = ing.id || normalizeKey(ing.name);
      const rest = leftovers.get(key);
      if (!rest || rest.amount <= 0) continue;

      const need = toBaseForIngredient(ing.quantity, key);
      if (!need || need.dimension !== rest.dimension) continue;

      // Mehr als den Rest kann ein Rezept nicht verwerten — der Überschuss
      // müsste ohnehin dazugekauft werden und zählt hier nicht als Gewinn.
      const share = Math.min(1, need.amount / rest.amount);
      uses.push({ ingredientName: rest.name, share });
      value += rest.value * share;
    }

    if (uses.length > 0) {
      suggestions.push({ recipe, uses, value: Math.round(value * 100) / 100 });
    }
  }

  return suggestions.sort((a, b) => b.value - a.value).slice(0, limit);
}
