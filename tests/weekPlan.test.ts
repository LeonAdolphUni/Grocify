/**
 * Wochenplan.
 *
 * Der Kern ist eine Entscheidung, die man leicht für einen Fehler hält:
 * `recipesInPlan` **dedupliziert nicht**. Wer Bolognese am Montag und am
 * Donnerstag kocht, braucht die Zutaten zweimal. Würde hier dedupliziert,
 * stünde die halbe Menge auf der Einkaufsliste — und der Fehler fiele erst
 * im Laden auf.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Recipe } from '../src/domain/types';
import {
  emptyWeek,
  plannedDayCount,
  recipesInPlan,
  totalMeals,
  WEEKDAYS,
  WEEKDAY_LABEL,
  WEEKDAY_SHORT,
  type WeekPlan,
} from '../src/domain/weekPlan';

const recipe = (id: string, title = id): Recipe => ({
  id,
  title,
  servings: 4,
  ingredients: [],
});

const ALL = [recipe('bolo', 'Bolognese'), recipe('omelett'), recipe('curry')];

function planWith(days: Partial<Record<(typeof WEEKDAYS)[number], string[]>>): WeekPlan {
  const plan = emptyWeek('test');
  Object.assign(plan.days, days);
  return plan;
}

describe('emptyWeek', () => {
  it('hat genau sieben leere Tage', () => {
    const plan = emptyWeek('w1');
    assert.equal(Object.keys(plan.days).length, 7);
    for (const day of WEEKDAYS) {
      assert.deepEqual(plan.days[day], [], `${day} sollte leer sein`);
    }
  });

  it('übernimmt id und Name, mit sinnvollem Standard', () => {
    assert.equal(emptyWeek('w1').name, 'Meine Woche');
    assert.equal(emptyWeek('w1', 'Ferienwoche').name, 'Ferienwoche');
  });

  it('gibt bei jedem Aufruf frische Listen zurück', () => {
    // Ein geteiltes Array wäre der klassische stille Fehler: Ein Gericht
    // eintragen würde es in jeder anderen Woche mit eintragen.
    const a = emptyWeek('a');
    const b = emptyWeek('b');
    a.days.mo.push('bolo');
    assert.deepEqual(b.days.mo, []);
  });
});

describe('recipesInPlan', () => {
  it('liefert die Rezepte in Wochentagsreihenfolge, nicht in Eingabereihenfolge', () => {
    const plan = planWith({ fr: ['curry'], mo: ['bolo'] });
    assert.deepEqual(
      recipesInPlan(plan, ALL).map((r) => r.id),
      ['bolo', 'curry'],
    );
  });

  it('dedupliziert NICHT — zweimal geplant heißt zweimal einkaufen', () => {
    const plan = planWith({ mo: ['bolo'], do: ['bolo'] });
    const found = recipesInPlan(plan, ALL);
    assert.equal(found.length, 2, 'beide Termine müssen zählen');
    assert.equal(found[0].id, 'bolo');
    assert.equal(found[1].id, 'bolo');
  });

  it('mehrere Gerichte an einem Tag behalten ihre Reihenfolge', () => {
    const plan = planWith({ sa: ['curry', 'omelett'] });
    assert.deepEqual(
      recipesInPlan(plan, ALL).map((r) => r.id),
      ['curry', 'omelett'],
    );
  });

  it('übergeht gelöschte Rezepte still, statt zu werfen', () => {
    // Karteileiche im Plan: Das Rezept wurde gelöscht, der Eintrag blieb.
    // Ein Absturz beim Öffnen des Wochenplans wäre die schlechteste Reaktion.
    const plan = planWith({ mo: ['bolo', 'gibtsnichtmehr'] });
    const found = recipesInPlan(plan, ALL);
    assert.deepEqual(found.map((r) => r.id), ['bolo']);
  });

  it('leerer Plan ergibt leere Liste', () => {
    assert.deepEqual(recipesInPlan(emptyWeek('leer'), ALL), []);
  });
});

describe('plannedDayCount und totalMeals', () => {
  it('zählen unterschiedliche Dinge', () => {
    // Zwei Gerichte am Samstag: ein belegter Tag, aber zwei Mahlzeiten.
    const plan = planWith({ mo: ['bolo'], sa: ['curry', 'omelett'] });
    assert.equal(plannedDayCount(plan), 2, 'zwei belegte Tage');
    assert.equal(totalMeals(plan), 3, 'drei Mahlzeiten');
  });

  it('leerer Plan zählt null', () => {
    const plan = emptyWeek('leer');
    assert.equal(plannedDayCount(plan), 0);
    assert.equal(totalMeals(plan), 0);
  });

  it('volle Woche zählt sieben Tage', () => {
    const plan = emptyWeek('voll');
    for (const day of WEEKDAYS) plan.days[day] = ['bolo'];
    assert.equal(plannedDayCount(plan), 7);
    assert.equal(totalMeals(plan), 7);
  });
});

describe('Wochentags-Beschriftungen', () => {
  it('jeder Tag hat einen langen und einen kurzen Namen', () => {
    for (const day of WEEKDAYS) {
      assert.ok(WEEKDAY_LABEL[day], `${day} braucht einen Namen`);
      assert.ok(WEEKDAY_SHORT[day], `${day} braucht eine Kurzform`);
    }
  });

  it('die Woche beginnt am Montag', () => {
    // Deutsche Konvention. Ein Plan, der sonntags beginnt, würde die
    // Sonnenblume auf dem Startbildschirm falsch herum füllen.
    assert.equal(WEEKDAYS[0], 'mo');
    assert.equal(WEEKDAYS.at(-1), 'so');
    assert.equal(WEEKDAYS.length, 7);
  });
});
