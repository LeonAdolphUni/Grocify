/**
 * Portionen umrechnen.
 *
 * Die wichtigste Zusage steht in `scaleRecipe`: **Das Original bleibt
 * unangetastet.** Umgerechnet wird beim Benutzen, nicht beim Speichern —
 * sonst würde aus „6 Portionen laut Chefkoch" dauerhaft „1 Portion", und
 * wer die Einstellung später ändert, hätte die Herkunft verloren.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { roundSensibly, scaleAll, scaleRecipe, scalingLabel } from '../src/domain/portions';
import type { Ingredient, Recipe } from '../src/domain/types';

const zutat = (
  name: string,
  amount: number,
  unit: Ingredient['quantity']['unit'],
): Ingredient => ({
  id: name.toLowerCase(),
  name,
  quantity: { amount, unit },
  rawText: `${amount} ${unit} ${name}`,
  isPantryStaple: false,
});

const rezept = (servings: number, zutaten: Ingredient[]): Recipe => ({
  id: 'r',
  title: 'Testgericht',
  servings,
  ingredients: zutaten,
  sourceUrl: 'https://www.chefkoch.de/rezepte/1/Test.html',
});

describe('scaleRecipe', () => {
  it('viertelt die Mengen von vier auf eine Portion', () => {
    const r = scaleRecipe(rezept(4, [zutat('Hackfleisch', 500, 'g')]), 1);
    assert.equal(r.servings, 1);
    assert.equal(r.ingredients[0].quantity.amount, 125);
  });

  it('verdoppelt von zwei auf vier', () => {
    const r = scaleRecipe(rezept(2, [zutat('Mehl', 300, 'g')]), 4);
    assert.equal(r.ingredients[0].quantity.amount, 600);
  });

  it('lässt gleiche Portionszahl unangetastet', () => {
    const original = rezept(2, [zutat('Mehl', 300, 'g')]);
    assert.equal(scaleRecipe(original, 2), original, 'dasselbe Objekt, keine Kopie');
  });

  it('verändert das Original nicht', () => {
    // Die zentrale Zusage: Umrechnen beim Benutzen, nicht beim Speichern.
    const original = rezept(6, [zutat('Kürbis', 1200, 'g')]);
    scaleRecipe(original, 1);
    assert.equal(original.servings, 6);
    assert.equal(original.ingredients[0].quantity.amount, 1200);
  });

  it('merkt sich die ursprüngliche Portionszahl', () => {
    const r = scaleRecipe(rezept(6, [zutat('Kürbis', 1200, 'g')]), 1);
    assert.equal(r.scaledFrom, 6);
    assert.equal(scalingLabel(r), '6 Portionen im Original → 1');
  });

  it('behält Titel, ID und Herkunft', () => {
    const r = scaleRecipe(rezept(4, [zutat('Mehl', 100, 'g')]), 1);
    assert.equal(r.id, 'r');
    assert.equal(r.title, 'Testgericht');
    assert.match(r.sourceUrl ?? '', /chefkoch/);
  });

  it('skaliert auch mehrdeutige Einheiten', () => {
    // „2 Zehen Knoblauch" für vier Portionen sind eine halbe für eine.
    // Beim Einkauf rundet die Packungsrechnung ohnehin auf.
    const r = scaleRecipe(rezept(4, [zutat('Knoblauch', 2, 'Zehe')]), 1);
    assert.equal(r.ingredients[0].quantity.amount, 0.5);
    assert.equal(r.ingredients[0].quantity.unit, 'Zehe');
  });

  it('behält den Originaltext der Zutat', () => {
    // rawText beschreibt, was im Rezept stand — er wird nicht umgeschrieben,
    // damit nachvollziehbar bleibt, woher die Zahl kommt.
    const r = scaleRecipe(rezept(4, [zutat('Hackfleisch', 500, 'g')]), 1);
    assert.equal(r.ingredients[0].rawText, '500 g Hackfleisch');
  });

  it('behandelt 0 Portionen als 1, statt durch null zu teilen', () => {
    const kaputt: Recipe = { ...rezept(0, [zutat('Mehl', 100, 'g')]) };
    const r = scaleRecipe(kaputt, 1);
    assert.ok(Number.isFinite(r.ingredients[0].quantity.amount));
  });

  it('rundet ein Ziel unter 1 auf 1 hoch', () => {
    assert.equal(scaleRecipe(rezept(4, []), 0).servings, 1);
  });
});

describe('roundSensibly', () => {
  it('große Mengen auf ganze Zahlen', () => {
    assert.equal(roundSensibly(416.6666), 417);
  });

  it('mittlere auf eine Nachkommastelle', () => {
    assert.equal(roundSensibly(41.6666), 41.7);
  });

  it('kleine auf zwei', () => {
    assert.equal(roundSensibly(4.16666), 4.17);
  });

  it('sehr kleine werden nicht zu Null', () => {
    // „0,25 Zehen" muss 0,25 bleiben — auf ganze Zahlen gerundet wäre es 0,
    // und damit wäre der Knoblauch aus dem Rezept verschwunden.
    assert.equal(roundSensibly(0.25), 0.25);
    assert.equal(roundSensibly(0.125), 0.125);
  });
});

describe('scaleAll', () => {
  it('rechnet Rezepte mit verschiedenen Portionszahlen auf dieselbe um', () => {
    // Das ist der Grund, warum vor dem Zusammenfassen skaliert werden muss:
    // Sonst würden 500 g aus einem Vier-Portionen-Rezept und 500 g aus einem
    // Acht-Portionen-Rezept als gleich viel addiert.
    const alle = scaleAll(
      [rezept(4, [zutat('Mehl', 400, 'g')]), { ...rezept(8, [zutat('Mehl', 800, 'g')]), id: 'r2' }],
      1,
    );
    assert.equal(alle[0].ingredients[0].quantity.amount, 100);
    assert.equal(alle[1].ingredients[0].quantity.amount, 100);
  });

  it('leere Liste bleibt leer', () => {
    assert.deepEqual(scaleAll([], 1), []);
  });
});

describe('scalingLabel', () => {
  it('gibt null, wenn nichts umgerechnet wurde', () => {
    assert.equal(scalingLabel(rezept(4, [])), null);
  });

  it('gibt null, wenn auf dieselbe Zahl umgerechnet wurde', () => {
    assert.equal(scalingLabel(scaleRecipe(rezept(4, []), 4)), null);
  });
});
