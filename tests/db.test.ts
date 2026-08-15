/**
 * Datenbankschicht.
 *
 * Jeder Test bekommt seine **eigene Datei** in einem temporären Ordner und
 * löscht sie danach. Tests, die sich eine Datenbank teilen, bestehen einzeln
 * und scheitern gemeinsam — oder schlimmer: Sie bestehen gemeinsam, weil der
 * eine aufräumt, was der andere kaputt macht.
 *
 * Geprüft wird vor allem das, was das Schema verspricht: Fremdschlüssel mit
 * `ON DELETE CASCADE`. Ein gelöschtes Rezept muss aus dem Wochenplan
 * verschwinden, sonst zeigt der Plan Karteileichen.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { GrocifyDb, PLAN_ID } from '../server/db';
import type { Recipe } from '../src/domain/types';
import { emptyWeek } from '../src/domain/weekPlan';

/** Eine frische Datenbank je Testreihe, danach restlos weg. */
function freshDb(): { db: GrocifyDb; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'grocify-test-'));
  const db = new GrocifyDb(join(dir, 'test.db'));
  return {
    db,
    cleanup: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const bolo: Recipe = {
  id: 'bolo',
  title: 'Spaghetti Bolognese',
  servings: 4,
  ingredients: [
    {
      id: 'hackfleisch',
      name: 'Hackfleisch',
      searchTermNl: 'gehakt',
      quantity: { amount: 500, unit: 'g' },
      rawText: '500 g Hackfleisch',
      isPantryStaple: false,
    },
    {
      id: 'salz',
      name: 'Salz',
      quantity: { amount: 1, unit: 'Prise' },
      rawText: '1 Prise Salz',
      isPantryStaple: true,
    },
  ],
};

describe('GrocifyDb — Rezepte', () => {
  let db: GrocifyDb;
  let cleanup: () => void;

  before(() => ({ db, cleanup } = freshDb()));
  after(() => cleanup());

  it('startet leer', () => {
    assert.deepEqual(db.listRecipes(), []);
  });

  it('legt an und liest zurück, samt Zutaten', () => {
    db.saveRecipe(bolo);
    const back = db.getRecipe('bolo');
    assert.equal(back?.title, 'Spaghetti Bolognese');
    assert.equal(back?.servings, 4);
    assert.equal(back?.ingredients.length, 2);
  });

  it('behält die Reihenfolge der Zutaten', () => {
    const back = db.getRecipe('bolo');
    assert.equal(back?.ingredients[0].name, 'Hackfleisch');
    assert.equal(back?.ingredients[1].name, 'Salz');
  });

  it('rundet den Vorrats-Schalter korrekt hin und zurück', () => {
    // SQLite kennt kein Boolean — 0/1 muss sauber zurückverwandelt werden.
    const back = db.getRecipe('bolo');
    assert.equal(back?.ingredients[0].isPantryStaple, false);
    assert.equal(back?.ingredients[1].isPantryStaple, true);
  });

  it('ersetzt beim zweiten Speichern, statt zu duplizieren', () => {
    db.saveRecipe({ ...bolo, title: 'Bolognese neu', ingredients: [bolo.ingredients[0]] });
    assert.equal(db.listRecipes().length, 1, 'immer noch ein Rezept');
    const back = db.getRecipe('bolo');
    assert.equal(back?.title, 'Bolognese neu');
    assert.equal(back?.ingredients.length, 1, 'alte Zutat muss weg sein');
  });

  it('gibt null für ein unbekanntes Rezept', () => {
    assert.equal(db.getRecipe('gibtsnicht'), null);
  });

  it('meldet beim Löschen, ob etwas gelöscht wurde', () => {
    assert.equal(db.deleteRecipe('gibtsnicht'), false);
    assert.equal(db.deleteRecipe('bolo'), true);
    assert.deepEqual(db.listRecipes(), []);
  });
});

describe('GrocifyDb — Herkunft', () => {
  let db: GrocifyDb;
  let cleanup: () => void;

  before(() => ({ db, cleanup } = freshDb()));
  after(() => cleanup());

  it('findet ein importiertes Rezept über seine Quell-URL', () => {
    const url = 'https://www.chefkoch.de/rezepte/123/Test.html';
    db.saveRecipe({ ...bolo, id: 'x1', sourceUrl: url });
    assert.equal(db.findRecipeBySourceUrl(url)?.id, 'x1');
  });

  it('gibt null für eine unbekannte Quelle', () => {
    assert.equal(db.findRecipeBySourceUrl('https://example.com/nix'), null);
  });

  it('selbst angelegte Rezepte ohne Quelle stören die Suche nicht', () => {
    db.saveRecipe({ ...bolo, id: 'x2' });
    assert.equal(db.findRecipeBySourceUrl('https://example.com/nix'), null);
  });
});

describe('GrocifyDb — Wochenplan', () => {
  let db: GrocifyDb;
  let cleanup: () => void;

  before(() => ({ db, cleanup } = freshDb()));
  after(() => cleanup());

  it('liefert einen leeren Plan, bevor je einer gespeichert wurde', () => {
    const plan = db.getWeekPlan();
    assert.equal(plan.id, PLAN_ID);
    assert.deepEqual(plan.days.mo, []);
  });

  it('speichert und liest Tage zurück', () => {
    db.saveRecipe(bolo);
    const plan = emptyWeek(PLAN_ID);
    plan.days.mo = ['bolo'];
    plan.days.do = ['bolo'];
    db.saveWeekPlan(plan);

    const back = db.getWeekPlan();
    assert.deepEqual(back.days.mo, ['bolo']);
    assert.deepEqual(back.days.do, ['bolo']);
  });

  it('übergeht Rezepte, die es nicht gibt, statt den Speichervorgang abzubrechen', () => {
    const plan = emptyWeek(PLAN_ID);
    plan.days.fr = ['bolo', 'phantom'];
    db.saveWeekPlan(plan);
    assert.deepEqual(db.getWeekPlan().days.fr, ['bolo']);
  });

  it('ein gelöschtes Rezept verschwindet aus dem Wochenplan (ON DELETE CASCADE)', () => {
    // Der Kern des relationalen Schemas. Ohne die Fremdschlüssel stünde im
    // Plan ein Verweis auf ein Rezept, das es nicht mehr gibt.
    //
    // Die Voraussetzung wird hier neu hergestellt: `saveWeekPlan` ersetzt den
    // ganzen Plan (es ist ein PUT, kein PATCH), der vorige Test hat Montag
    // also mit abgeräumt. Auf den Zustand eines anderen Tests zu bauen wäre
    // ohnehin die schlechtere Wahl.
    const plan = emptyWeek(PLAN_ID);
    plan.days.mo = ['bolo'];
    plan.days.do = ['bolo'];
    db.saveWeekPlan(plan);
    assert.ok(db.getWeekPlan().days.mo.includes('bolo'), 'Voraussetzung: Montag belegt');

    db.deleteRecipe('bolo');

    const back = db.getWeekPlan();
    assert.deepEqual(back.days.mo, []);
    assert.deepEqual(back.days.do, []);
  });
});

describe('GrocifyDb — Kennzahlen', () => {
  let db: GrocifyDb;
  let cleanup: () => void;

  before(() => ({ db, cleanup } = freshDb()));
  after(() => cleanup());

  it('zählt Rezepte, Zutaten und geplante Gerichte', () => {
    db.saveRecipe(bolo);
    const plan = emptyWeek(PLAN_ID);
    plan.days.mo = ['bolo'];
    db.saveWeekPlan(plan);

    const stats = db.stats();
    assert.equal(stats.recipes, 1);
    assert.equal(stats.ingredients, 2);
    assert.equal(stats.plannedMeals, 1);
  });
});
