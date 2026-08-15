/**
 * Nährwertrechnung.
 *
 * Kein Netzwerk: Der Anbieter ist eine Attrappe mit festen Werten. Geprüft
 * wird die Rechnung und — wichtiger — die **Ehrlichkeit**: Dass fehlende
 * Zutaten benannt werden, dass Gramm nicht gegen Milliliter gerechnet wird,
 * und dass eine zu dünne Grundlage als solche erkannt wird.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addFacts,
  coverageLabel,
  isTrustworthy,
  nutritionForRecipe,
  scaleNutrition,
} from '../src/domain/nutrition';
import type { Ingredient, Product, Recipe } from '../src/domain/types';
import type { Nutrition, PriceProvider, SearchResult } from '../src/supermarkets/types';

/* ── Attrappe ──────────────────────────────────────────────────────── */

const HACK: Nutrition = { basis: 'g', kcal: 196, fat: 12, carbs: 5.6, protein: 16, salt: 0.75 };
const MILCH: Nutrition = { basis: 'ml', kcal: 46, fat: 1.5, carbs: 4.8, protein: 3.5 };

function fakeProvider(over: Partial<PriceProvider> = {}): PriceProvider {
  const produkt = (id: string, title: string): Product =>
    ({
      id,
      provider: 'fake',
      title,
      price: 1,
      packageSize: '500 g',
      isAvailable: true,
    }) as Product;

  return {
    id: 'fake',
    displayName: 'Attrappe',
    available: true,
    async searchProducts(query): Promise<SearchResult> {
      const p = produkt(query, query);
      return { products: [p], totalResults: 1 };
    },
    async getProductById(id) {
      return produkt(id, id);
    },
    async getCategories() {
      return [];
    },
    async getSubCategories() {
      return [];
    },
    async browseCategory(): Promise<SearchResult> {
      return { products: [], totalResults: 0 };
    },
    async getNutrition(id) {
      if (id.includes('gehakt')) return HACK;
      if (id.includes('melk')) return MILCH;
      return null;
    },
    ...over,
  };
}

const ing = (
  name: string,
  amount: number,
  unit: Ingredient['quantity']['unit'],
  searchTermNl?: string,
): Ingredient => ({
  id: name.toLowerCase(),
  name,
  searchTermNl,
  quantity: { amount, unit },
  rawText: `${amount} ${unit} ${name}`,
  isPantryStaple: false,
});

const recipe = (ingredients: Ingredient[], servings = 2): Recipe => ({
  id: 'r',
  title: 'Testgericht',
  servings,
  ingredients,
});

/* ── Tests ─────────────────────────────────────────────────────────── */

describe('scaleNutrition', () => {
  it('rechnet je 100 g auf die tatsächliche Menge hoch', () => {
    const facts = scaleNutrition(HACK, 500, 'mass');
    assert.equal(facts?.kcal, 980, '5 × 196');
    assert.equal(facts?.protein, 80);
  });

  it('halbe Bezugsmenge halbiert die Werte', () => {
    assert.equal(scaleNutrition(HACK, 50, 'mass')?.kcal, 98);
  });

  it('rechnet Gramm NICHT gegen Milliliter', () => {
    // Bei Öl und Honig läge das deutlich daneben — lieber gar kein Wert.
    assert.equal(scaleNutrition(HACK, 100, 'volume'), null);
    assert.equal(scaleNutrition(MILCH, 100, 'mass'), null);
  });

  it('Stückmengen haben keine Bezugsgröße', () => {
    assert.equal(scaleNutrition(HACK, 3, 'count'), null);
  });

  it('fehlende Felder bleiben fehlend statt zu null zu werden', () => {
    const facts = scaleNutrition(MILCH, 100, 'volume');
    assert.equal(facts?.salt, undefined, 'Milch meldet kein Salz');
  });
});

describe('addFacts', () => {
  it('addiert feldweise', () => {
    const sum = addFacts({ kcal: 100, fat: 5 }, { kcal: 50, protein: 3 });
    assert.equal(sum.kcal, 150);
    assert.equal(sum.fat, 5);
    assert.equal(sum.protein, 3);
  });

  it('behandelt Fehlendes nicht als Null', () => {
    const sum = addFacts({ kcal: 100 }, { fat: 2 });
    assert.equal(sum.salt, undefined);
  });
});

describe('nutritionForRecipe', () => {
  it('summiert und teilt durch die Portionen', () => {
    const r = recipe([ing('Hackfleisch', 500, 'g', 'gehakt')], 2);
    return nutritionForRecipe(r, fakeProvider()).then((n) => {
      assert.equal(n.total.kcal, 980);
      assert.equal(n.perServing.kcal, 490);
      assert.equal(n.servings, 2);
      assert.equal(n.covered, 1);
    });
  });

  it('rechnet Volumen über die ml-Bezugsgröße', async () => {
    const r = recipe([ing('Milch', 0.5, 'l', 'melk')], 1);
    const n = await nutritionForRecipe(r, fakeProvider());
    assert.equal(n.total.kcal, 230, '500 ml × 46 kcal/100 ml');
  });

  it('rechnet Stückmengen über die Gewichtstabelle mit', async () => {
    // „2 Zwiebeln" wären ohne Tabelle unrechenbar. Mit ihr sind es 220 g.
    const zwiebel: Ingredient = { ...ing('Zwiebel', 2, 'Stueck', 'gehakt'), id: 'zwiebel' };
    const n = await nutritionForRecipe(recipe([zwiebel], 1), fakeProvider());
    assert.equal(n.covered, 1);
    assert.equal(n.total.kcal, Math.round(196 * 2.2));
  });

  it('benennt Zutaten ohne Nährwerte, statt sie zu verschweigen', async () => {
    const r = recipe([ing('Hackfleisch', 500, 'g', 'gehakt'), ing('Petersilie', 20, 'g', 'kruid')]);
    const n = await nutritionForRecipe(r, fakeProvider());
    assert.equal(n.covered, 1);
    assert.equal(n.missing.length, 1);
    assert.equal(n.missing[0].name, 'Petersilie');
    assert.equal(n.missing[0].reason, 'keine Nährwerte');
  });

  it('benennt unrechenbare Mengen', async () => {
    const r = recipe([ing('Wunderkraut', 1, 'Bund', 'gehakt')]);
    const n = await nutritionForRecipe(r, fakeProvider());
    assert.equal(n.missing[0].reason, 'Menge nicht in Gramm umrechenbar');
  });

  it('benennt Zutaten ohne Produkttreffer', async () => {
    const provider = fakeProvider({
      async searchProducts() {
        return { products: [], totalResults: 0 };
      },
    });
    const n = await nutritionForRecipe(recipe([ing('Nichts', 100, 'g', 'nix')]), provider);
    assert.equal(n.missing[0].reason, 'kein Produkt');
    assert.equal(n.covered, 0);
  });

  it('ein Ausfall der Datenquelle bricht die Rechnung nicht ab', async () => {
    const provider = fakeProvider({
      async getNutrition() {
        throw new Error('Netz weg');
      },
    });
    const n = await nutritionForRecipe(recipe([ing('Hackfleisch', 500, 'g', 'gehakt')]), provider);
    assert.equal(n.covered, 0);
    assert.equal(n.missing[0].reason, 'keine Nährwerte');
  });

  it('nutzt das vom Nutzer festgelegte Produkt', async () => {
    let gefragt: string | null = null;
    const provider = fakeProvider({
      async getProductById(id) {
        gefragt = id;
        return { id, provider: 'fake', title: id, price: 1, isAvailable: true } as Product;
      },
    });
    const fest: Ingredient = {
      ...ing('Hackfleisch', 500, 'g', 'gehakt'),
      pinnedProduct: { provider: 'fake', id: 'gehakt-fest', title: 'Fest', packageSize: '500 g' },
    };
    await nutritionForRecipe(recipe([fest]), provider);
    assert.equal(gefragt, 'gehakt-fest', 'die Wahl des Nutzers gewinnt gegen die Automatik');
  });

  it('fragt dasselbe Produkt nur einmal ab', async () => {
    let aufrufe = 0;
    const provider = fakeProvider({
      async getNutrition() {
        aufrufe++;
        return HACK;
      },
    });
    const r = recipe([ing('Hack A', 100, 'g', 'gehakt'), ing('Hack B', 200, 'g', 'gehakt')]);
    await nutritionForRecipe(r, provider);
    assert.equal(aufrufe, 1, 'der Zwischenspeicher greift');
  });
});

describe('Ehrlichkeit der Anzeige', () => {
  it('coverageLabel zählt Zutaten, nicht Prozente', () => {
    const n = { covered: 7, totalIngredients: 10 } as never;
    assert.equal(coverageLabel(n), '7 von 10 Zutaten');
  });

  it('unter der Hälfte gilt als nicht belastbar', () => {
    assert.equal(isTrustworthy({ covered: 4, totalIngredients: 10 } as never), false);
    assert.equal(isTrustworthy({ covered: 5, totalIngredients: 10 } as never), true);
  });

  it('ein Rezept ohne Zutaten ist nie belastbar', () => {
    assert.equal(isTrustworthy({ covered: 0, totalIngredients: 0 } as never), false);
  });
});
