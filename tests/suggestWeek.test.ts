/**
 * Wochenvorschlag.
 *
 * Der Vorschlag ist nicht „sieben beliebige Gerichte" — das könnte ein
 * Würfel. Er soll Gerichte wählen, die sich **Zutaten teilen**, weil genau
 * daraus der Nutzen der App entsteht: eine Packung über mehrere Abende.
 * Dieser Test hält fest, dass die Auswahl das tatsächlich tut.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Ingredient, Recipe } from '../src/domain/types';
import { planFromRecipes, plannedDayCount, suggestWeek, totalMeals, WEEKDAYS } from '../src/domain/weekPlan';

const zutat = (name: string, staple = false): Ingredient => ({
  id: name.toLowerCase(),
  name,
  quantity: { amount: 100, unit: 'g' },
  rawText: name,
  isPantryStaple: staple,
});

const rezept = (id: string, zutaten: string[], staples: string[] = []): Recipe => ({
  id,
  title: id,
  servings: 2,
  ingredients: [...zutaten.map((z) => zutat(z)), ...staples.map((z) => zutat(z, true))],
});

describe('suggestWeek', () => {
  it('leere Rezeptliste ergibt leeren Vorschlag', () => {
    assert.deepEqual(suggestWeek([]), []);
  });

  it('nimmt höchstens so viele Gerichte wie Tage', () => {
    const viele = Array.from({ length: 12 }, (_, i) => rezept(`r${i}`, [`z${i}`]));
    assert.equal(suggestWeek(viele).length, 7);
  });

  it('nimmt alle, wenn es weniger als sieben sind', () => {
    assert.equal(suggestWeek([rezept('a', ['x']), rezept('b', ['y'])]).length, 2);
  });

  it('beginnt beim zutatenreichsten Rezept', () => {
    // Es bietet die größte Angriffsfläche für Überschneidungen.
    const gewaehlt = suggestWeek([
      rezept('klein', ['a']),
      rezept('gross', ['a', 'b', 'c', 'd']),
      rezept('mittel', ['a', 'b']),
    ]);
    assert.equal(gewaehlt[0].id, 'gross');
  });

  it('bevorzugt Gerichte, die Zutaten mit dem Geplanten teilen', () => {
    const gewaehlt = suggestWeek(
      [
        rezept('basis', ['hack', 'tomate', 'zwiebel']),
        rezept('fremd', ['lachs', 'dill', 'sahne']),
        rezept('teilt', ['hack', 'tomate']),
      ],
      2,
    );
    assert.deepEqual(
      gewaehlt.map((r) => r.id),
      ['basis', 'teilt'],
      'das überschneidende Rezept muss vor dem fremden kommen',
    );
  });

  it('wertet nach Anteil, nicht nach absoluter Trefferzahl', () => {
    // „lang" teilt zwei Zutaten, aber nur 2 von 8 — ein schlechteres
    // Geschäft als 2 von 2. Ohne Anteilsrechnung gewänne immer das Rezept
    // mit der längsten Zutatenliste.
    //
    // „basis" bekommt bewusst die meisten Zutaten, damit die Startwahl
    // feststeht: Der erste Griff geht ans zutatenreichste Rezept, und erst
    // ab dem zweiten greift die Überschneidungsregel, die hier geprüft wird.
    const gewaehlt = suggestWeek(
      [
        rezept('basis', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']),
        rezept('lang', ['a', 'b', 'q', 'w', 'x', 'y', 'z', 'v']),
        rezept('kurz', ['a', 'b']),
      ],
      2,
    );
    assert.equal(gewaehlt[0].id, 'basis', 'Startwahl: das zutatenreichste');
    assert.equal(gewaehlt[1].id, 'kurz', '2 von 2 schlägt 2 von 8');
  });

  it('Vorratsware zählt nicht als Überschneidung', () => {
    // Sonst gälten zwei Gerichte als verwandt, nur weil beide Salz enthalten.
    const gewaehlt = suggestWeek(
      [
        rezept('basis', ['hack'], ['salz', 'pfeffer']),
        rezept('nurStaples', ['lachs'], ['salz', 'pfeffer']),
        rezept('echterTreffer', ['hack']),
      ],
      2,
    );
    assert.equal(gewaehlt[1].id, 'echterTreffer');
  });

  it('nimmt kein Rezept zweimal', () => {
    const gewaehlt = suggestWeek([rezept('a', ['x']), rezept('b', ['x'])], 7);
    assert.equal(new Set(gewaehlt.map((r) => r.id)).size, gewaehlt.length);
  });
});

describe('planFromRecipes', () => {
  it('verteilt der Reihe nach auf die Wochentage', () => {
    const plan = planFromRecipes('w', 'Test', [rezept('a', []), rezept('b', []), rezept('c', [])]);
    assert.deepEqual(plan.days.mo, ['a']);
    assert.deepEqual(plan.days.di, ['b']);
    assert.deepEqual(plan.days.mi, ['c']);
    assert.deepEqual(plan.days.do, []);
  });

  it('sieben Rezepte belegen sieben Tage', () => {
    const sieben = WEEKDAYS.map((_, i) => rezept(`r${i}`, []));
    const plan = planFromRecipes('w', 'Test', sieben);
    assert.equal(plannedDayCount(plan), 7);
    assert.equal(totalMeals(plan), 7);
  });

  it('mehr als sieben laufen um und belegen Tage doppelt', () => {
    const neun = Array.from({ length: 9 }, (_, i) => rezept(`r${i}`, []));
    const plan = planFromRecipes('w', 'Test', neun);
    assert.equal(totalMeals(plan), 9);
    assert.equal(plan.days.mo.length, 2);
  });

  it('keine Rezepte ergibt eine leere Woche', () => {
    assert.equal(totalMeals(planFromRecipes('w', 'Test', [])), 0);
  });
});
