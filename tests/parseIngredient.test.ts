/**
 * Zutaten-Parser: die Schreibweisen, die Menschen wirklich tippen.
 *
 * Die Fälle stammen aus `scripts/smoke-parse.ts` und prüften dort schon das
 * Richtige — sie liefen nur am Testrunner vorbei und meldeten Fehler über
 * einen Zähler und `console.log` statt über einen Rückgabewert. Jetzt bricht
 * `npm test` ab, wenn einer kippt.
 *
 * Der zweite Teil des Smoke-Skripts (getippter Text → echtes Produkt bei
 * Albert Heijn) bleibt dort: Er braucht Netzwerk und gehört damit nicht in
 * eine Testreihe, die auch offline laufen muss.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseAmount,
  parseIngredientInput,
  parseUnitWord,
} from '../src/domain/parseIngredient';

/** Kurzform für den Vergleich: „Milch · 0.5 l" */
function format(input: string): string {
  const parsed = parseIngredientInput(input);
  if (!parsed) return '(nichts)';
  return `${parsed.name} · ${parsed.quantity.amount} ${parsed.quantity.unit}`;
}

describe('parseIngredientInput — Menge hinten', () => {
  // Die Schreibweise aus der ursprünglichen Anforderung: „milch 0,5l"
  const cases: [string, string][] = [
    ['milch 0,5l', 'milch · 0.5 l'],
    ['Mehl 300g', 'Mehl · 300 g'],
    ['Hackfleisch 500 g', 'Hackfleisch · 500 g'],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}"`, () => assert.equal(format(input), expected));
  }
});

describe('parseIngredientInput — Menge vorne', () => {
  const cases: [string, string][] = [
    ['500g Hackfleisch', 'Hackfleisch · 500 g'],
    ['0,5 l Milch', 'Milch · 0.5 l'],
    ['2 Zehen Knoblauch', 'Knoblauch · 2 Zehe'],
    ['1 Bund Petersilie', 'Petersilie · 1 Bund'],
    ['2 EL Tomatenmark', 'Tomatenmark · 2 EL'],
    ['1 Prise Salz', 'Salz · 1 Prise'],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}"`, () => assert.equal(format(input), expected));
  }
});

describe('parseIngredientInput — Zahlenformate', () => {
  const cases: [string, string, string][] = [
    ['3 Eier', 'Eier · 3 Stueck', 'Zahl ohne Einheit wird Stück'],
    ['2 Paprika', 'Paprika · 2 Stueck', 'dito'],
    ['1/2 l Sahne', 'Sahne · 0.5 l', 'Bruch'],
    ['1.5 kg Kartoffeln', 'Kartoffeln · 1.5 kg', 'Punkt als Dezimaltrenner'],
    ['2-3 EL Olivenöl', 'Olivenöl · 2 EL', 'Spanne → untere Grenze'],
  ];
  for (const [input, expected, why] of cases) {
    it(`"${input}" (${why})`, () => assert.equal(format(input), expected));
  }
});

describe('parseIngredientInput — Namen und Einheitsschreibweisen', () => {
  const cases: [string, string][] = [
    ['200 g geriebener Käse', 'geriebener Käse · 200 g'],
    ['1 Packung Blätterteig', 'Blätterteig · 1 Packung'],
    ['Petersilie', 'Petersilie · 1 Stueck'],
    ['250 Gramm Butter', 'Butter · 250 g'],
    ['1 Liter Wasser', 'Wasser · 1 l'],
    ['3 Stk Zwiebeln', 'Zwiebeln · 3 Stueck'],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}"`, () => assert.equal(format(input), expected));
  }
});

describe('parseIngredientInput — was abgelehnt gehört', () => {
  // Eine Zutat ohne Namen ist keine Zutat. Sie stillschweigend durchzulassen
  // hieße, eine leere Zeile in die Einkaufsliste zu schreiben.
  for (const junk of ['', '   ', '500', '2 EL']) {
    it(`"${junk}" wird abgelehnt`, () => {
      assert.equal(parseIngredientInput(junk), null);
    });
  }
});

describe('parseUnitWord / parseAmount — die Bausteine für den Chefkoch-Import', () => {
  it('erkennt ausgeschriebene Einheiten', () => {
    assert.equal(parseUnitWord('Gramm'), 'g');
    assert.equal(parseUnitWord('Liter'), 'l');
    assert.equal(parseUnitWord('EL'), 'EL');
  });

  it('verkraftet Chefkochs Klammerformen', () => {
    // Chefkoch liefert Einheiten wie „Zehe(n)" und „Prise(n)".
    assert.equal(parseUnitWord('Zehe(n)'), 'Zehe');
    assert.equal(parseUnitWord('Prise(n)'), 'Prise');
  });

  it('gibt bei Unbekanntem null statt zu raten', () => {
    assert.equal(parseUnitWord('m.-große'), null);
    assert.equal(parseUnitWord(''), null);
    assert.equal(parseUnitWord(undefined), null);
  });

  it('parseAmount versteht Komma, Punkt und Bruch', () => {
    assert.equal(parseAmount('0,5'), 0.5);
    assert.equal(parseAmount('1.25'), 1.25);
    assert.equal(parseAmount('1/2'), 0.5);
    assert.equal(parseAmount('3'), 3);
  });

  it('parseAmount gibt bei Unlesbarem null', () => {
    assert.equal(parseAmount(''), null);
    assert.equal(parseAmount(undefined), null);
    assert.equal(parseAmount('etwas'), null);
  });
});
