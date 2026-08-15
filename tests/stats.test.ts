/**
 * Kennzahlen und Restenutzung.
 *
 * Das sind die Zahlen, mit denen die App wirbt — auf dem Statistikfenster und
 * auf der Landingpage steht „85 % verwertet · 1,43 € je Portion". Wenn hier
 * etwas falsch gerechnet wird, ist die Aussage der ganzen App falsch.
 *
 * Der subtilste Fall ist die Gewichtung: Die Verwertungsquote zählt nicht
 * Zeilen, sondern Geld. Ein Rest Basilikum für 20 Cent darf nicht so schwer
 * wiegen wie ein halbes Stück Parmesan für 3 €.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { suggestRecipesForLeftovers } from '../src/domain/leftoverUse';
import {
  calculateStats,
  calculateTotal,
  packagesNeeded,
  type Ingredient,
  type Recipe,
  type ShoppingList,
  type ShoppingListItem,
} from '../src/domain/types';

/* ── Hilfsbau ──────────────────────────────────────────────────────── */

function item(over: Partial<ShoppingListItem> & { lineTotal: number }): ShoppingListItem {
  const name = over.ingredient?.name ?? 'Zutat';
  return {
    ingredient: {
      id: name.toLowerCase(),
      name,
      quantity: { amount: 1, unit: 'Stueck' },
      rawText: name,
      isPantryStaple: false,
      ...over.ingredient,
    } as Ingredient,
    product: over.product ?? ({ id: 'x', title: 'Produkt', price: over.lineTotal } as never),
    requiredQuantity: { amount: 1, unit: 'Stueck' },
    packagesToBuy: 1,
    needsManualMatch: false,
    checked: false,
    leftoverValue: 0,
    ...over,
  } as ShoppingListItem;
}

const recipe = (id: string, servings: number, ingredients: Ingredient[] = []): Recipe => ({
  id,
  title: id,
  servings,
  ingredients,
});

const list = (items: ShoppingListItem[], recipes: Recipe[] = []): ShoppingList => ({
  id: 'l',
  recipes,
  items,
  provider: 'albertHeijn',
  total: calculateTotal(items),
  createdAt: new Date().toISOString(),
});

/* ── Tests ─────────────────────────────────────────────────────────── */

describe('packagesNeeded', () => {
  it('rundet immer auf — halbe Packungen gibt es nicht', () => {
    assert.equal(packagesNeeded({ amount: 250, dimension: 'mass' }, { amount: 100, dimension: 'mass' }), 3);
  });

  it('exakt aufgehende Mengen brauchen keine zusätzliche Packung', () => {
    assert.equal(packagesNeeded({ amount: 500, dimension: 'mass' }, { amount: 500, dimension: 'mass' }), 1);
  });

  it('gibt null bei unpassenden Dimensionen statt zu raten', () => {
    // Bedarf in ml, Gebinde in Stück — das muss der Nutzer entscheiden.
    assert.equal(packagesNeeded({ amount: 200, dimension: 'volume' }, { amount: 1, dimension: 'count' }), null);
  });
});

describe('calculateTotal', () => {
  it('summiert auf Cent gerundet', () => {
    assert.equal(calculateTotal([item({ lineTotal: 1.11 }), item({ lineTotal: 2.22 })]), 3.33);
  });

  it('vermeidet Fließkomma-Schmutz', () => {
    // 0.1 + 0.2 ergibt in JavaScript 0.30000000000000004.
    assert.equal(calculateTotal([item({ lineTotal: 0.1 }), item({ lineTotal: 0.2 })]), 0.3);
  });

  it('leere Liste kostet nichts', () => {
    assert.equal(calculateTotal([]), 0);
  });
});

describe('calculateStats — Verwertung wird nach Geld gewichtet', () => {
  it('ein teurer Rest wiegt schwerer als ein billiger', () => {
    // Zeilenzählung ergäbe (1,0 + 0,0) / 2 = 50 %.
    // Geldgewichtung ergibt (1,0·0,20 + 0,0·3,00) / 3,20 = 6,25 %.
    const stats = calculateStats(
      list([
        item({ lineTotal: 0.2, utilization: 1, ingredient: { name: 'Basilikum' } as Ingredient }),
        item({ lineTotal: 3.0, utilization: 0, ingredient: { name: 'Parmesan' } as Ingredient }),
      ]),
    );
    assert.ok(stats.utilization !== null);
    assert.ok(
      stats.utilization < 0.1,
      `erwartet deutlich unter 50 %, war ${(stats.utilization * 100).toFixed(1)} %`,
    );
  });

  it('volle Verwertung ergibt 100 %', () => {
    const stats = calculateStats(list([item({ lineTotal: 2, utilization: 1 })]));
    assert.equal(stats.utilization, 1);
  });

  it('ohne berechenbare Verwertung gibt es null statt einer erfundenen Zahl', () => {
    const stats = calculateStats(list([item({ lineTotal: 2 })]));
    assert.equal(stats.utilization, null);
  });
});

describe('calculateStats — Portionen und Preis', () => {
  it('rechnet den Preis je Portion aus allen Rezepten', () => {
    const stats = calculateStats(list([item({ lineTotal: 20 })], [recipe('a', 4), recipe('b', 6)]));
    assert.equal(stats.servings, 10);
    assert.equal(stats.pricePerServing, 2);
  });

  it('ohne Rezepte gibt es keinen Portionspreis statt einer Division durch null', () => {
    const stats = calculateStats(list([item({ lineTotal: 20 })]));
    assert.equal(stats.servings, 0);
    assert.equal(stats.pricePerServing, null);
  });

  it('zählt zugeordnete und offene Positionen getrennt', () => {
    const stats = calculateStats(
      list([item({ lineTotal: 1 }), item({ lineTotal: 0, product: null, needsManualMatch: true })]),
    );
    assert.equal(stats.matched, 1);
    assert.equal(stats.unmatched, 1);
  });

  it('findet die teuerste Position', () => {
    const stats = calculateStats(
      list([
        item({ lineTotal: 1.5, ingredient: { name: 'Milch' } as Ingredient }),
        item({ lineTotal: 8.38, ingredient: { name: 'Hähnchenbrust' } as Ingredient }),
        item({ lineTotal: 2.0, ingredient: { name: 'Käse' } as Ingredient }),
      ]),
    );
    assert.equal(stats.mostExpensive?.ingredient.name, 'Hähnchenbrust');
  });
});

describe('suggestRecipesForLeftovers', () => {
  const ing = (name: string, amount: number, unit: 'g' | 'ml' | 'Stueck'): Ingredient => ({
    id: name.toLowerCase(),
    name,
    quantity: { amount, unit },
    rawText: `${amount} ${unit} ${name}`,
    isPantryStaple: false,
  });

  const restliste = (recipes: Recipe[] = []) =>
    list(
      [
        item({
          lineTotal: 4.32,
          leftoverValue: 3.0,
          leftover: { amount: 95, unit: 'g' },
          ingredient: ing('Parmesan', 50, 'g'),
        }),
        item({
          lineTotal: 1.49,
          leftoverValue: 0.4,
          leftover: { amount: 700, unit: 'g' },
          ingredient: ing('Reis', 300, 'g'),
        }),
      ],
      recipes,
    );

  it('bewertet nach Geldwert, nicht nach Menge', () => {
    // 700 g Reis für 40 Cent sind mengenmäßig mehr, aber weniger wert als
    // 95 g Parmesan für 3 €.
    const parmesanGericht = recipe('risotto-p', 2, [ing('Parmesan', 95, 'g')]);
    const reisGericht = recipe('reispfanne', 2, [ing('Reis', 700, 'g')]);

    const found = suggestRecipesForLeftovers(restliste(), [reisGericht, parmesanGericht]);
    assert.equal(found[0].recipe.id, 'risotto-p', 'der teurere Rest muss zuerst kommen');
    assert.ok(found[0].value > found[1].value);
  });

  it('überspringt Rezepte, die schon eingeplant sind', () => {
    const geplant = recipe('schon-dabei', 2, [ing('Parmesan', 95, 'g')]);
    const found = suggestRecipesForLeftovers(restliste([geplant]), [geplant]);
    assert.deepEqual(found, [], 'ein Vorschlag, den man schon kocht, hilft niemandem');
  });

  it('rechnet keinen Gewinn für mehr, als übrig ist', () => {
    // Das Rezept bräuchte 500 g, übrig sind 95 g. Verwertet werden können
    // nur die 95 g — der Rest müsste dazugekauft werden.
    const gross = recipe('gross', 8, [ing('Parmesan', 500, 'g')]);
    const found = suggestRecipesForLeftovers(restliste(), [gross]);
    assert.equal(found[0].uses[0].share, 1, 'Anteil ist bei 1 gedeckelt');
    assert.ok(found[0].value <= 3.0);
  });

  it('ohne Reste gibt es keine Vorschläge', () => {
    const ohneReste = list([item({ lineTotal: 2, leftoverValue: 0 })]);
    assert.deepEqual(suggestRecipesForLeftovers(ohneReste, [recipe('x', 2)]), []);
  });

  it('hält sich an das Limit', () => {
    const kandidaten = [1, 2, 3, 4, 5].map((n) => recipe(`r${n}`, 2, [ing('Parmesan', 20, 'g')]));
    assert.equal(suggestRecipesForLeftovers(restliste(), kandidaten, 2).length, 2);
  });
});
