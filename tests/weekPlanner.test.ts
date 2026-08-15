/**
 * Der Wochenplaner-Helfer.
 *
 * Zwei Zusagen werden hier festgehalten:
 *
 *   **Wünsche schlagen alles andere.** Ein Vorschlag, der ignoriert, worauf
 *   man Lust hat, ist keiner — deshalb wiegt der Wunsch schwerer als Vorrat,
 *   Überschneidung und Nährwerte zusammen.
 *
 *   **Was nicht gefunden wurde, wird benannt.** Ein Planer, der einen Wunsch
 *   still verschluckt, wirkt beim zweiten Mal unbrauchbar.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PantryItem } from '../src/domain/pantry';
import type { Ingredient, Recipe } from '../src/domain/types';
import {
  estimateNutrition,
  healthScore,
  matchesWish,
  pantryCoverage,
  parseWishes,
  planWeek,
} from '../src/domain/weekPlanner';

const zutat = (
  name: string,
  amount = 100,
  unit: Ingredient['quantity']['unit'] = 'g',
  staple = false,
): Ingredient => ({
  id: name.toLowerCase(),
  name,
  quantity: { amount, unit },
  rawText: `${amount} ${unit} ${name}`,
  isPantryStaple: staple,
});

const rezept = (id: string, titel: string, zutaten: Ingredient[], servings = 2): Recipe => ({
  id,
  title: titel,
  servings,
  ingredients: zutaten,
});

describe('parseWishes', () => {
  it('trennt an Komma und Bindewörtern', () => {
    assert.deepEqual(parseWishes('Pasta, Suppe'), ['pasta', 'suppe']);
  });

  it('wirft Füllwörter weg', () => {
    // „was mit Hähnchen" als Ganzes findet nichts — der Wunsch ist „Hähnchen".
    assert.deepEqual(parseWishes('Pasta und was mit Hähnchen'), ['pasta', 'hähnchen']);
  });

  it('entfernt Satzzeichen und Dubletten', () => {
    assert.deepEqual(parseWishes('Suppe! Suppe?'), ['suppe']);
  });

  it('leere Eingabe ergibt keine Wünsche', () => {
    assert.deepEqual(parseWishes('   '), []);
  });

  it('ignoriert zu kurze Wörter', () => {
    assert.deepEqual(parseWishes('ei zu'), []);
  });
});

describe('matchesWish', () => {
  const bolo = rezept('b', 'Spaghetti Bolognese', [zutat('Hackfleisch'), zutat('Tomaten')]);

  it('findet im Titel', () => {
    assert.equal(matchesWish(bolo, 'spaghetti'), true);
  });

  it('findet in den Zutaten', () => {
    // Der Wunsch bezieht sich auf das, was drin ist — nicht nur auf den Namen.
    assert.equal(matchesWish(bolo, 'hackfleisch'), true);
  });

  it('löst Oberbegriffe auf', () => {
    // „Pasta" steht in keinem Rezept, „Spaghetti" schon.
    assert.equal(matchesWish(bolo, 'pasta'), true);
    assert.equal(matchesWish(bolo, 'fleisch'), true);
  });

  it('trifft nicht auf Unpassendes', () => {
    assert.equal(matchesWish(bolo, 'fisch'), false);
    assert.equal(matchesWish(bolo, 'kuchen'), false);
  });
});

describe('estimateNutrition und healthScore', () => {
  it('rechnet ohne Netzwerk aus der Durchschnittstabelle', () => {
    const r = rezept('r', 'Test', [zutat('Hackfleisch', 400), zutat('Tomaten', 400)], 2);
    const n = estimateNutrition(r);
    assert.ok(n.kcal !== null && n.kcal > 0);
    assert.equal(n.covered, 2);
  });

  it('gibt null, wenn zu wenig bekannt ist', () => {
    const r = rezept('r', 'Test', [zutat('Wunderpulver', 10)]);
    assert.equal(healthScore(r), null);
  });

  it('bewertet eiweißreich besser als fettreich', () => {
    const mager = rezept('a', 'Mager', [zutat('Haehnchen', 400), zutat('Brokkoli', 300)], 2);
    const fett = rezept('b', 'Fett', [zutat('Butter', 200), zutat('Speck', 300)], 2);
    const a = healthScore(mager);
    const b = healthScore(fett);
    assert.ok(a !== null && b !== null);
    assert.ok(a > b, `mager (${a}) muss besser sein als fett (${b})`);
  });
});

describe('pantryCoverage', () => {
  // Reis bewusst statt Mehl: Mehl gilt als Vorratsware („hat man
  // üblicherweise") und wird deshalb gar nicht erst gezählt — mit Mehl als
  // Beispiel würde der Test das Falsche messen.
  const vorrat: PantryItem[] = [
    { id: 'reis', name: 'Reis', quantity: { amount: 500, unit: 'g' }, updatedAt: '' },
  ];

  it('zählt gedeckte Zutaten', () => {
    const r = rezept('r', 'Test', [zutat('Reis', 200), zutat('Milch', 200)]);
    assert.equal(pantryCoverage(r, vorrat), 0.5);
  });

  it('leerer Vorrat deckt nichts', () => {
    assert.equal(pantryCoverage(rezept('r', 'T', [zutat('Reis')]), []), 0);
  });

  it('Vorratsware zählt nicht mit', () => {
    // Sonst wäre jedes Rezept „gedeckt", weil Salz im Schrank steht — und
    // die Kennzahl wäre wertlos.
    const r = rezept('r', 'Test', [zutat('Reis', 200), zutat('Salz', 1, 'Prise', true)]);
    assert.equal(pantryCoverage(r, vorrat), 1, 'nur die eine echte Zutat zählt');
  });

  it('auch Mehl und Öl bleiben außen vor, ohne dass man sie markieren muss', () => {
    // `isPantryStaple` erkennt sie am Namen — die Markierung im Rezept ist
    // nur die zweite Absicherung.
    const r = rezept('r', 'Test', [zutat('Reis', 200), zutat('Mehl', 300), zutat('Öl', 20, 'ml')]);
    assert.equal(pantryCoverage(r, vorrat), 1);
  });
});

describe('planWeek', () => {
  const rezepte = [
    rezept('bolo', 'Spaghetti Bolognese', [zutat('Hackfleisch'), zutat('Tomaten')]),
    rezept('kip', 'Reispfanne mit Hähnchen', [zutat('Haehnchen'), zutat('Reis')]),
    rezept('suppe', 'Tomatensuppe', [zutat('Tomaten'), zutat('Zwiebel')]),
    rezept('salat', 'Gurkensalat', [zutat('Gurke'), zutat('Joghurt')]),
  ];

  it('liefert so viele Gerichte wie Tage', () => {
    assert.equal(planWeek(rezepte, { days: 3 }).picks.length, 3);
  });

  it('nimmt nicht mehr, als es Rezepte gibt', () => {
    assert.equal(planWeek(rezepte, { days: 7 }).picks.length, 4);
  });

  it('nimmt kein Rezept zweimal', () => {
    const ids = planWeek(rezepte, { days: 4 }).picks.map((p) => p.recipe.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('der Wunsch bestimmt das erste Gericht', () => {
    const r = planWeek(rezepte, { wishes: 'Hähnchen', days: 3 });
    assert.equal(r.picks[0].recipe.id, 'kip');
    assert.ok(
      r.picks[0].reasons.some((x) => x.kind === 'wunsch'),
      'der Grund muss benannt sein',
    );
  });

  it('benennt Wünsche, für die nichts gefunden wurde', () => {
    const r = planWeek(rezepte, { wishes: 'Sushi', days: 2 });
    assert.deepEqual(r.unmatchedWishes, ['sushi']);
  });

  it('der Vorrat hebt ein Gericht nach vorn', () => {
    const vorrat: PantryItem[] = [
      { id: 'gurke', name: 'Gurke', quantity: { amount: 400, unit: 'g' }, updatedAt: '' },
      { id: 'joghurt', name: 'Joghurt', quantity: { amount: 400, unit: 'g' }, updatedAt: '' },
    ];
    const r = planWeek(rezepte, { pantry: vorrat, days: 1 });
    assert.equal(r.picks[0].recipe.id, 'salat');
    assert.ok(r.picks[0].pantryShare > 0.9);
  });

  it('überspringt ausgeschlossene Rezepte', () => {
    const r = planWeek(rezepte, { exclude: ['bolo', 'kip'], days: 4 });
    assert.deepEqual(r.picks.map((p) => p.recipe.id).sort(), ['salat', 'suppe']);
  });

  it('verteilt auf die Wochentage', () => {
    const r = planWeek(rezepte, { days: 3 });
    assert.equal(r.plan.days.mo.length, 1);
    assert.equal(r.plan.days.di.length, 1);
    assert.equal(r.plan.days.mi.length, 1);
    assert.equal(r.plan.days.do.length, 0);
  });

  it('leere Rezeptliste ergibt leeren Vorschlag', () => {
    const r = planWeek([], { days: 5 });
    assert.deepEqual(r.picks, []);
  });

  it('jeder Vorschlag trägt eine Begründung oder eine Kalorienangabe', () => {
    // Ein Vorschlag ohne beides wäre nicht überprüfbar.
    for (const p of planWeek(rezepte, { wishes: 'Tomaten', days: 4 }).picks) {
      assert.ok(
        p.reasons.length > 0 || p.kcalPerServing !== null,
        `${p.recipe.title} steht ohne Begründung da`,
      );
    }
  });
});

describe('planWeek — der Vorrat wird aufgebraucht', () => {
  const vorrat: PantryItem[] = [
    { id: 'reis', name: 'Reis', quantity: { amount: 200, unit: 'g' }, updatedAt: '' },
    { id: 'gurke', name: 'Gurke', quantity: { amount: 400, unit: 'g' }, updatedAt: '' },
  ];

  const rezepte = [
    rezept('reis1', 'Reispfanne', [zutat('Reis', 200)]),
    rezept('reis2', 'Reissalat', [zutat('Reis', 200)]),
    rezept('gurke1', 'Gurkensalat', [zutat('Gurke', 400)]),
  ];

  it('zählt einen Vorratseintrag nicht zweimal', () => {
    // Ohne schrumpfenden Vorrat bekämen beide Reisgerichte Punkte für
    // dieselben 200 g — und am Ende läge der Reis trotzdem im Schrank.
    const r = planWeek(rezepte, { pantry: vorrat, days: 2 });
    const mitVorrat = r.picks.filter((p) => p.pantryShare > 0);
    assert.equal(mitVorrat.length, 2, 'zwei verschiedene Einträge, nicht zweimal derselbe');
    assert.notEqual(mitVorrat[0].recipe.id, mitVorrat[1].recipe.id);
    assert.ok(
      !(mitVorrat[0].recipe.id.startsWith('reis') && mitVorrat[1].recipe.id.startsWith('reis')),
      'nicht beide Reisgerichte',
    );
  });

  it('meldet, was übrig bleibt', () => {
    const r = planWeek(rezepte, { pantry: vorrat, days: 1 });
    assert.equal(r.pantryLeftover.length, 1, 'ein Eintrag bleibt bei nur einem Tag');
    assert.ok(r.pantryUsedShare > 0 && r.pantryUsedShare < 1);
  });

  it('leert den Vorrat vollständig, wenn genug Tage da sind', () => {
    const r = planWeek(rezepte, { pantry: vorrat, days: 3 });
    assert.deepEqual(r.pantryLeftover, [], 'nichts darf liegen bleiben');
    assert.equal(r.pantryUsedShare, 1);
  });

  it('benennt in der Begründung, dass ein Eintrag aufgebraucht wird', () => {
    const r = planWeek(rezepte, { pantry: vorrat, days: 1 });
    assert.ok(
      r.picks[0].reasons.some((x) => x.label.includes('braucht')),
      'die Begründung muss das Aufbrauchen nennen',
    );
  });

  it('ohne Vorrat gibt es nichts aufzubrauchen', () => {
    const r = planWeek(rezepte, { days: 2 });
    assert.equal(r.pantryUsedShare, 0);
    assert.deepEqual(r.pantryLeftover, []);
  });
});
