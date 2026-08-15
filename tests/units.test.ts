/**
 * Einheiten und Umrechnung.
 *
 * Läuft mit `node:test` — eingebaut seit Node 18, keine neue Abhängigkeit.
 * Kein Netzwerk: Diese Tests laufen auch im Zug.
 *
 * Der wichtigste Test hier ist nicht, dass 1 kg = 1000 g ergibt. Es ist
 * der, dass „1 Bund" **null** ergibt. Ein stillschweigend geratener
 * Durchschnittswert wäre schlimmer als eine Rückfrage, und genau diese
 * Entscheidung soll niemand aus Versehen wegoptimieren.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatQuantity,
  isAmbiguous,
  scale,
  toBase,
  toBaseForIngredient,
  type Quantity,
} from '../src/domain/units';

describe('toBase — eindeutige Einheiten', () => {
  const cases: [Quantity, number, string][] = [
    [{ amount: 1, unit: 'kg' }, 1000, 'mass'],
    [{ amount: 250, unit: 'g' }, 250, 'mass'],
    [{ amount: 1.5, unit: 'l' }, 1500, 'volume'],
    [{ amount: 500, unit: 'ml' }, 500, 'volume'],
    [{ amount: 2, unit: 'EL' }, 30, 'volume'],
    [{ amount: 3, unit: 'TL' }, 15, 'volume'],
    [{ amount: 4, unit: 'Stueck' }, 4, 'count'],
  ];

  for (const [q, amount, dimension] of cases) {
    it(`${q.amount} ${q.unit} → ${amount} (${dimension})`, () => {
      const base = toBase(q);
      assert.ok(base, `${q.unit} sollte auflösbar sein`);
      assert.equal(base.amount, amount);
      assert.equal(base.dimension, dimension);
    });
  }
});

describe('toBase — mehrdeutige Einheiten geben null', () => {
  // Das ist eine bewusste Entwurfsentscheidung, kein fehlendes Feature.
  // „1 Bund Petersilie" (≈30 g) und „1 Bund Möhren" (≈500 g) sind beides
  // „1 Bund" — ohne die Zutat zu kennen, ist jede Zahl geraten.
  for (const unit of ['Prise', 'Msp', 'Bund', 'Zehe', 'Packung', 'Dose'] as const) {
    it(`${unit} ist ohne Zutat nicht auflösbar`, () => {
      assert.equal(toBase({ amount: 1, unit }), null);
      assert.equal(isAmbiguous(unit), true);
    });
  }

  it('eindeutige Einheiten sind nicht mehrdeutig', () => {
    for (const unit of ['g', 'kg', 'ml', 'l', 'EL', 'TL', 'Stueck'] as const) {
      assert.equal(isAmbiguous(unit), false, `${unit} sollte eindeutig sein`);
    }
  });
});

describe('toBaseForIngredient — mit Zutat wird aufgelöst', () => {
  it('Knoblauchzehe bekommt ein Gewicht', () => {
    const base = toBaseForIngredient({ amount: 2, unit: 'Zehe' }, 'knoblauch');
    assert.ok(base, 'Knoblauch steht in AMBIGUOUS_WEIGHTS');
    assert.equal(base.dimension, 'mass');
    assert.ok(base.amount > 0);
  });

  it('unbekannte Zutat bleibt unauflösbar statt geraten zu werden', () => {
    assert.equal(
      toBaseForIngredient({ amount: 1, unit: 'Bund' }, 'kaenguruhfleisch'),
      null,
    );
  });

  it('eindeutige Einheit braucht die Zutat gar nicht', () => {
    const base = toBaseForIngredient({ amount: 300, unit: 'g' }, 'voellig egal');
    assert.deepEqual(base, { amount: 300, dimension: 'mass' });
  });
});

describe('scale — Portionen umrechnen', () => {
  it('verdoppeln', () => {
    assert.deepEqual(scale({ amount: 250, unit: 'g' }, 2, 4), { amount: 500, unit: 'g' });
  });

  it('halbieren', () => {
    assert.deepEqual(scale({ amount: 4, unit: 'Stueck' }, 4, 2), { amount: 2, unit: 'Stueck' });
  });

  it('gleiche Portionszahl lässt die Menge unangetastet', () => {
    assert.deepEqual(scale({ amount: 1, unit: 'l' }, 3, 3), { amount: 1, unit: 'l' });
  });

  it('null Ausgangsportionen wird abgelehnt statt still zu Infinity zu werden', () => {
    // Division durch 0 wäre der klassische stille Fehler — die Einkaufsliste
    // stünde dann auf „Infinity g Mehl". `scale` wirft stattdessen, und das
    // ist die bessere Wahl: Ein Rezept mit 0 Portionen ist ein Datenfehler,
    // der laut werden soll, kein Wert, den man weiterreicht.
    assert.throws(
      () => scale({ amount: 100, unit: 'g' }, 0, 4),
      /fromServings/,
    );
  });

  it('negative Ausgangsportionen ebenso', () => {
    assert.throws(() => scale({ amount: 100, unit: 'g' }, -2, 4));
  });
});

describe('formatQuantity — lesbare Ausgabe', () => {
  it('rechnet große Grammzahlen nicht in kg um (Packungen denken in g)', () => {
    const s = formatQuantity({ amount: 500, unit: 'g' });
    assert.match(s, /500/);
  });

  it('hängt keine Nachkommastellen an glatte Zahlen', () => {
    assert.doesNotMatch(formatQuantity({ amount: 2, unit: 'Stueck' }), /2[.,]0/);
  });
});
