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
  sameIngredientName,
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

describe('sameIngredientName — Singular gegen Plural', () => {
  it('erkennt die deutschen Pluralendungen', () => {
    // Genau der gemeldete Fehler: „2 Zwiebeln" im Vorrat wurde gegen
    // „Zwiebel" im Rezept nicht gefunden, und der Vorrat blieb wirkungslos.
    const paare: [string, string][] = [
      ['Zwiebel', 'Zwiebeln'],
      ['Tomate', 'Tomaten'],
      ['Kartoffel', 'Kartoffeln'],
      ['Möhre', 'Möhren'],
      ['Paprika', 'Paprikas'],
      ['Ei', 'Eier'],
      ['Apfel', 'Äpfel'],
    ];
    for (const [a, b] of paare) {
      assert.equal(sameIngredientName(a, b), true, `${a} / ${b}`);
      assert.equal(sameIngredientName(b, a), true, `${b} / ${a} (umgekehrt)`);
    }
  });

  it('ist unempfindlich gegen Schreibweise', () => {
    assert.equal(sameIngredientName('ZWIEBELN', ' zwiebel '), true);
  });

  it('wirft verschiedene Zutaten nicht zusammen', () => {
    const fremd: [string, string][] = [
      ['Käse', 'Möhre'],
      ['Mehl', 'Milch'],
      ['Zwiebel', 'Knoblauch'],
      ['Sahne', 'Salz'],
    ];
    for (const [a, b] of fremd) {
      assert.equal(sameIngredientName(a, b), false, `${a} / ${b} dürfen nicht gleich sein`);
    }
  });

  it('kurze Stämme greifen nur exakt', () => {
    // Ohne Mindestlänge wäre „Eis" der Plural von „Ei" — die Endungsregel
    // trifft bei zwei Buchstaben auf zu vieles zu.
    assert.equal(sameIngredientName('Ei', 'Eis'), false);
  });
});

describe('sameIngredientName — Vorrat deutsch, Rezept niederlaendisch', () => {
  // Der schwerste bisher gefundene Fehler in diesem Projekt, und er war
  // vollstaendig stumm: Seit die Rezepte aus Allerhande kommen, stehen ihre
  // Zutaten auf Niederlaendisch. Der Vorrat steht auf Deutsch. Gemessen
  // wurde damit NICHTS mehr abgezogen — ausser bei Zufallstreffern wie
  // "Paprika"/"paprika". Die Einkaufsliste kaufte alles doppelt, ohne dass
  // irgendwo eine Warnung stand.

  it('erkennt uebersetzte Zutaten', () => {
    assert.equal(sameIngredientName('Reis', 'rijst'), true);
    assert.equal(sameIngredientName('Zwiebel', 'ui'), true);
    assert.equal(sameIngredientName('Käse', 'kaas'), true);
    assert.equal(sameIngredientName('Hähnchen', 'kip'), true);
  });

  it('erkennt sie auch im Plural — so tippt man den Vorrat wirklich', () => {
    // Plural UND Sprache muessen zusammen greifen. Getrennt scheitert genau
    // der Alltagsfall: Die Pluralregel kommt von "zwiebeln" nicht auf "ui",
    // und das Woerterbuch kennt "zwiebel", nicht "zwiebeln".
    assert.equal(sameIngredientName('Zwiebeln', 'ui'), true);
    assert.equal(sameIngredientName('Kartoffeln', 'aardappelen'), true);
  });

  it('funktioniert in beide Richtungen', () => {
    // Es steht nicht fest, welcher der beiden Namen der deutsche ist.
    assert.equal(sameIngredientName('rijst', 'Reis'), true);
    assert.equal(sameIngredientName('ui', 'Zwiebeln'), true);
  });

  it('verwechselt trotzdem nichts', () => {
    // Uebersetzen darf nicht dazu fuehren, dass alles auf alles passt.
    assert.equal(sameIngredientName('Reis', 'kaas'), false);
    assert.equal(sameIngredientName('Zwiebel', 'kip'), false);
    assert.equal(sameIngredientName('Mehl', 'suiker'), false);
    assert.equal(sameIngredientName('Reis', 'rijstwafel'), false);
  });

  it('zieht den Vorrat dann auch wirklich ab', () => {
    // Der Beweis am ganzen Weg, nicht nur am Namensvergleich.
    const d = deductFromPantry(
      { id: 'rijst', name: 'rijst', quantity: { amount: 300, unit: 'g' } },
      [{ id: 'reis', name: 'Reis', quantity: { amount: 500, unit: 'g' }, updatedAt: '2026-08-01T10:00:00Z' }],
    );
    assert.equal(d.fullyCovered, true);
    assert.equal(d.covered, 300);
  });

  it('wer niederlaendisch tippt, braucht keine Uebersetzung', () => {
    assert.equal(sameIngredientName('rijst', 'rijst', 'nl'), true);
    assert.equal(sameIngredientName('Reis', 'rijst', 'nl'), false);
  });
});

describe('sameIngredientName — niederlaendische Grammatik', () => {
  // Gefunden beim Nachsehen, warum "Vorrat aufbrauchen" 0 % lieferte: Die
  // Uebersetzung stimmte, aber Allerhande schreibt "rode paprika's", "rode
  // uien", "zilvervliesrijst". Adjektiv davor, Plural hinten, Kopf im
  // Kompositum ganz hinten — nichts davon traf.

  it('sieht ueber Farb- und Groessenwoerter hinweg', () => {
    assert.equal(sameIngredientName('Paprika', 'rode paprika'), true);
    assert.equal(sameIngredientName('Zwiebel', 'middelgrote ui'), true);
  });

  it('versteht den niederlaendischen Plural', () => {
    assert.equal(sameIngredientName('Zwiebeln', 'uien'), true);
    assert.equal(sameIngredientName('Paprika', "rode paprika's"), true);
  });

  it('erkennt den Kopf im Kompositum — der steht hinten', () => {
    // Niederlaendisch bildet Zusammensetzungen kopf-final:
    // "zilvervliesrijst" ist Reis.
    assert.equal(sameIngredientName('Reis', 'zilvervliesrijst'), true);
  });

  it('faellt nicht auf "rijstwafels" herein', () => {
    // Kopf-final heisst auch: "rijstwafel" ist eine Waffel, kein Reis.
    assert.equal(sameIngredientName('Reis', 'rijstwafels'), false);
  });

  it('haelt Suesskartoffeln von Kartoffeln getrennt', () => {
    // "zoete" ist kein Beiwort, sondern der Unterschied. Wer es
    // wegstreicht, meldet Kartoffeln als gedeckt, die es nicht gibt.
    assert.equal(sameIngredientName('Kartoffeln', 'zoete aardappelen'), false);
    assert.equal(sameIngredientName('Kartoffeln', 'aardappelen'), true);
  });

  it('macht aus "Eis" kein "Ei"', () => {
    // Die niederlaendische Pluralregel darf das deutsche "-s" nicht
    // mitnehmen. Deshalb gilt die Mindestlaenge je Endung: "uien" darf auf
    // zwei Zeichen schrumpfen, "Eis" nicht.
    assert.equal(sameIngredientName('Ei', 'Eis'), false);
    assert.equal(sameIngredientName('Zwiebeln', 'uien'), true);
  });

  it('verwechselt Kartoffeln nicht mit Aepfeln', () => {
    // "aardappelen" endet auf "appelen". Ohne ausdrueckliche Sperre faellt
    // die Kompositum-Regel genau hier herein — und der Nutzer steht ohne
    // Kartoffeln da, weil die Liste sie fuer gedeckt hielt.
    assert.equal(sameIngredientName('Äpfel', 'aardappelen'), false);
    assert.equal(sameIngredientName('Apfel', 'aardappel'), false);
  });
});

describe('deductFromPantry — Plural in der Praxis', () => {
  it('2 Zwiebeln im Vorrat decken 2 Zwiebeln im Rezept', () => {
    const eintrag: PantryItem = {
      id: 'zwiebeln',
      name: 'Zwiebeln',
      quantity: { amount: 2, unit: 'Stueck' },
      updatedAt: new Date().toISOString(),
    };
    const d = deductFromPantry(zutat('Zwiebel', 2, 'Stueck'), [eintrag]);
    assert.equal(d.fullyCovered, true, 'muss vollständig gedeckt sein');
    assert.equal(d.remaining.amount, 0);
  });

  it('3 Eier im Vorrat decken 2 Eier im Rezept', () => {
    const eintrag: PantryItem = {
      id: 'eier',
      name: 'Eier',
      quantity: { amount: 3, unit: 'Stueck' },
      updatedAt: new Date().toISOString(),
    };
    assert.equal(deductFromPantry(zutat('Ei', 2, 'Stueck'), [eintrag]).fullyCovered, true);
  });
});

describe('pantryKey', () => {
  it('normalisiert wie überall sonst', () => {
    assert.equal(pantryKey('Möhre'), 'moehre');
    assert.equal(pantryKey('  MEHL '), 'mehl');
  });
});
