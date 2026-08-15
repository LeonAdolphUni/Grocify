/**
 * Vorrat.
 *
 * Die Kernentscheidung steht in `deductFromPantry`: **Abgezogen wird nur,
 * was sich vergleichen lässt.** Stehen 2 Zwiebeln im Vorrat und das Rezept
 * braucht 300 g, wird nichts abgezogen, solange kein Stückgewicht bekannt
 * ist — lieber einmal zu viel kaufen als mit zu wenig am Herd stehen.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addToPantry,
  deductFromPantry,
  pantryKey,
  prunePantry,
  stalestDays,
  type PantryItem,
} from '../src/domain/pantry';
import type { Ingredient } from '../src/domain/types';

const vorrat = (name: string, amount: number, unit: Ingredient['quantity']['unit']): PantryItem => ({
  id: pantryKey(name),
  name,
  quantity: { amount, unit },
  updatedAt: new Date().toISOString(),
});

const zutat = (
  name: string,
  amount: number,
  unit: Ingredient['quantity']['unit'],
): Pick<Ingredient, 'id' | 'name' | 'quantity'> => ({
  id: pantryKey(name),
  name,
  quantity: { amount, unit },
});

describe('deductFromPantry — vollständig gedeckt', () => {
  it('genug im Schrank heißt: nicht auf die Liste', () => {
    const d = deductFromPantry(zutat('Mehl', 300, 'g'), [vorrat('Mehl', 800, 'g')]);
    assert.equal(d.fullyCovered, true);
    assert.equal(d.remaining.amount, 0);
    assert.equal(d.covered, 300);
  });

  it('exakt genug zählt als gedeckt', () => {
    const d = deductFromPantry(zutat('Mehl', 500, 'g'), [vorrat('Mehl', 500, 'g')]);
    assert.equal(d.fullyCovered, true);
  });

  it('rechnet über Einheitsgrenzen hinweg', () => {
    // 0,5 l Bedarf gegen 800 ml Vorrat — dieselbe Dimension, andere Einheit.
    const d = deductFromPantry(zutat('Milch', 0.5, 'l'), [vorrat('Milch', 800, 'ml')]);
    assert.equal(d.fullyCovered, true);
  });
});

describe('deductFromPantry — teilweise gedeckt', () => {
  it('zieht ab und lässt den Rest stehen', () => {
    const d = deductFromPantry(zutat('Mehl', 1, 'kg'), [vorrat('Mehl', 800, 'g')]);
    assert.equal(d.fullyCovered, false);
    assert.equal(d.remaining.amount, 200, 'Rest in Basiseinheit');
    assert.equal(d.remaining.unit, 'g');
  });

  it('meldet, wie viel gedeckt wurde', () => {
    const d = deductFromPantry(zutat('Reis', 400, 'g'), [vorrat('Reis', 100, 'g')]);
    assert.equal(d.covered, 100);
    assert.equal(d.remaining.amount, 300);
  });
});

describe('deductFromPantry — was NICHT abgezogen wird', () => {
  it('nicht im Vorrat: unverändert', () => {
    const d = deductFromPantry(zutat('Lachs', 300, 'g'), [vorrat('Mehl', 800, 'g')]);
    assert.equal(d.skipped, 'nicht im Vorrat');
    assert.equal(d.remaining.amount, 300);
    assert.equal(d.covered, 0);
  });

  it('unvergleichbare Mengen: lieber zu viel kaufen', () => {
    // „2 Bund Petersilie" im Vorrat gegen „300 g" im Rezept — ohne
    // Bundgewicht ist jede Zahl geraten. Mit zu wenig am Herd zu stehen
    // ist schlimmer als eine Packung zu viel.
    const d = deductFromPantry(zutat('Wunderkraut', 300, 'g'), [vorrat('Wunderkraut', 2, 'Bund')]);
    assert.equal(d.skipped, 'Mengen nicht vergleichbar');
    assert.equal(d.remaining.amount, 300);
  });

  it('leerer Vorrat ändert nichts', () => {
    const d = deductFromPantry(zutat('Mehl', 300, 'g'), []);
    assert.equal(d.remaining.amount, 300);
  });

  it('findet den Eintrag auch über den Namen, wenn die ID abweicht', () => {
    const eintrag: PantryItem = { ...vorrat('Mehl', 800, 'g'), id: 'komische-id' };
    const d = deductFromPantry(zutat('Mehl', 300, 'g'), [eintrag]);
    assert.equal(d.fullyCovered, true);
  });
});

describe('addToPantry', () => {
  it('legt neu an', () => {
    const p = addToPantry([], 'Mehl', { amount: 500, unit: 'g' });
    assert.equal(p.length, 1);
    assert.equal(p[0].quantity.amount, 500);
  });

  it('addiert zu Vorhandenem', () => {
    const p = addToPantry([vorrat('Mehl', 300, 'g')], 'Mehl', { amount: 500, unit: 'g' });
    assert.equal(p.length, 1);
    assert.equal(p[0].quantity.amount, 800);
  });

  it('addiert über Einheitsgrenzen', () => {
    const p = addToPantry([vorrat('Milch', 500, 'ml')], 'Milch', { amount: 1, unit: 'l' });
    assert.equal(p[0].quantity.amount, 1500);
    assert.equal(p[0].quantity.unit, 'ml');
  });

  it('ersetzt statt zu addieren, wenn die Mengen nicht zusammenpassen', () => {
    // „2 Stück" und „500 g" zu summieren ergäbe eine Fantasiezahl.
    const p = addToPantry([vorrat('Paprika', 2, 'Stueck')], 'Paprika', { amount: 500, unit: 'g' });
    assert.equal(p[0].quantity.amount, 500);
    assert.equal(p[0].quantity.unit, 'g');
  });

  it('frischt den Zeitstempel auf', async () => {
    const alt: PantryItem = { ...vorrat('Mehl', 300, 'g'), updatedAt: '2020-01-01T00:00:00.000Z' };
    const p = addToPantry([alt], 'Mehl', { amount: 100, unit: 'g' });
    assert.ok(Date.parse(p[0].updatedAt) > Date.parse(alt.updatedAt));
  });
});

describe('prunePantry und stalestDays', () => {
  it('wirft leere Einträge weg', () => {
    const p = prunePantry([vorrat('Mehl', 0, 'g'), vorrat('Reis', 200, 'g')]);
    assert.equal(p.length, 1);
    assert.equal(p[0].name, 'Reis');
  });

  it('leerer Vorrat hat kein Alter', () => {
    assert.equal(stalestDays([]), null);
  });

  it('rechnet das Alter des ältesten Eintrags in Tagen', () => {
    const jetzt = Date.parse('2026-08-15T12:00:00.000Z');
    const alt: PantryItem = { ...vorrat('Mehl', 1, 'g'), updatedAt: '2026-08-05T12:00:00.000Z' };
    const neu: PantryItem = { ...vorrat('Reis', 1, 'g'), updatedAt: '2026-08-14T12:00:00.000Z' };
    assert.equal(stalestDays([neu, alt], jetzt), 10);
  });
});

describe('pantryKey', () => {
  it('normalisiert wie überall sonst', () => {
    assert.equal(pantryKey('Möhre'), 'moehre');
    assert.equal(pantryKey('  MEHL '), 'mehl');
  });
});
