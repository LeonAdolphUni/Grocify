/**
 * Sicherung und Zurückholen.
 *
 * Eine Sicherung, die man nie zurückgeholt hat, ist keine Sicherung, sondern
 * eine Hoffnung. Deshalb prüft dieser Test den ganzen Kreis: Datenbank →
 * JSON → **andere, leere** Datenbank → derselbe Inhalt.
 *
 * Alles läuft in temporären Ordnern. Die echte `server/data/grocify.db` wird
 * hier nie angefasst — ein Test, der die Daten des Nutzers berührt, wäre
 * genau die Katastrophe, gegen die er schützen soll.
 *
 * Der Umweg über JSON.parse(JSON.stringify(...)) ist Absicht: Er bildet ab,
 * was beim Schreiben und Lesen der Datei wirklich passiert. Ein Test, der
 * das Objekt direkt weiterreicht, würde `undefined`-Felder und Datumswerte
 * nicht so behandeln wie die echte Datei.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { BackupError, exportBackup, importBackup } from '../server/backup';
import { GrocifyDb, PLAN_ID } from '../server/db';
import type { Recipe } from '../src/domain/types';
import { emptyWeek } from '../src/domain/weekPlan';

let dir: string;
let quelle: GrocifyDb;
let ziel: GrocifyDb;

const REZEPTE: Recipe[] = [
  {
    id: 'carbonara',
    title: 'Carbonara wie bei der Mamma in Rom',
    servings: 2,
    sourceUrl: 'https://www.chefkoch.de/rezepte/111/Carbonara.html',
    ingredients: [
      {
        id: 'spaghetti',
        name: 'Spaghetti',
        searchTermNl: 'spaghetti',
        quantity: { amount: 250, unit: 'g' },
        rawText: '250 g Spaghetti',
        isPantryStaple: false,
      },
      {
        id: 'salz',
        name: 'Salz',
        quantity: { amount: 1, unit: 'Prise' },
        rawText: 'nach Geschmack Salz',
        isPantryStaple: true,
      },
    ],
  },
  {
    id: 'gurkensalat',
    title: 'Klassischer Gurkensalat',
    servings: 4,
    ingredients: [
      {
        id: 'gurke',
        name: 'Gurke',
        searchTermNl: 'komkommer',
        quantity: { amount: 1, unit: 'Stueck' },
        rawText: '1 Gurke',
        isPantryStaple: false,
        pinnedProduct: {
          provider: 'albertHeijn',
          id: 'wi123456',
          title: 'AH Komkommer',
          packageSize: '1 stuk',
        },
      },
    ],
  },
];

/** Wie die Datei: einmal durch JSON und zurück. */
const durchDatei = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grocify-backup-'));
  quelle = new GrocifyDb(join(dir, 'quelle.db'));
  ziel = new GrocifyDb(join(dir, 'ziel.db'));

  for (const r of REZEPTE) quelle.saveRecipe(r);
  const plan = emptyWeek(PLAN_ID);
  plan.days.mo = ['carbonara'];
  plan.days.mi = ['gurkensalat'];
  plan.days.fr = ['carbonara'];
  quelle.saveWeekPlan(plan);
});

afterEach(() => {
  quelle.close();
  ziel.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('exportBackup', () => {
  it('kennzeichnet sich als Grocify-Sicherung mit Format und Zeitstempel', () => {
    const b = exportBackup(quelle);
    assert.equal(b.app, 'grocify');
    assert.equal(b.format, 1);
    assert.ok(!Number.isNaN(Date.parse(b.createdAt)), 'createdAt muss ein Datum sein');
  });

  it('enthält Rezepte, Zutaten und Wochenplan', () => {
    const b = exportBackup(quelle);
    assert.equal(b.recipes.length, 2);
    assert.equal(b.stats.ingredients, 3);
    assert.deepEqual(b.weekPlan.days.mo, ['carbonara']);
    assert.deepEqual(b.weekPlan.days.fr, ['carbonara']);
  });

  it('überlebt den Weg durch die Datei', () => {
    const roh = JSON.stringify(exportBackup(quelle), null, 2);
    assert.ok(roh.includes('\n  '), 'eingerückt, damit man es lesen kann');
    const zurueck = JSON.parse(roh);
    assert.equal(zurueck.recipes.length, 2);
  });

  it('eine leere Datenbank ergibt eine leere Rezeptliste', () => {
    assert.deepEqual(exportBackup(ziel).recipes, []);
  });
});

describe('importBackup — der ganze Kreis', () => {
  it('holt beide Rezepte in eine leere Datenbank', () => {
    const result = importBackup(ziel, durchDatei(exportBackup(quelle)));
    assert.equal(result.neu, 2);
    assert.equal(result.ersetzt, 0);
    assert.equal(ziel.listRecipes().length, 2);
  });

  it('Zutaten, Einheiten und der Vorrats-Schalter überleben', () => {
    importBackup(ziel, durchDatei(exportBackup(quelle)));
    const carbonara = ziel.getRecipe('carbonara');
    const spaghetti = carbonara?.ingredients.find((i) => i.name === 'Spaghetti');
    const salz = carbonara?.ingredients.find((i) => i.name === 'Salz');
    assert.equal(spaghetti?.quantity.amount, 250);
    assert.equal(spaghetti?.quantity.unit, 'g');
    assert.equal(spaghetti?.searchTermNl, 'spaghetti');
    assert.equal(salz?.isPantryStaple, true);
  });

  it('ein festgelegtes Produkt überlebt', () => {
    // Das ist die Handarbeit des Nutzers — sie zu verlieren wäre am
    // ärgerlichsten, weil sie sich nicht von selbst wiederherstellt.
    importBackup(ziel, durchDatei(exportBackup(quelle)));
    const gurke = ziel.getRecipe('gurkensalat')?.ingredients[0];
    assert.equal(gurke?.pinnedProduct?.id, 'wi123456');
    assert.equal(gurke?.pinnedProduct?.title, 'AH Komkommer');
    assert.equal(gurke?.pinnedProduct?.packageSize, '1 stuk');
  });

  it('die Herkunft importierter Rezepte überlebt', () => {
    importBackup(ziel, durchDatei(exportBackup(quelle)));
    const found = ziel.findRecipeBySourceUrl('https://www.chefkoch.de/rezepte/111/Carbonara.html');
    assert.equal(found?.id, 'carbonara');
  });

  it('der Wochenplan steht wieder — samt Doppelbelegung', () => {
    const result = importBackup(ziel, durchDatei(exportBackup(quelle)));
    const plan = ziel.getWeekPlan();
    assert.deepEqual(plan.days.mo, ['carbonara']);
    assert.deepEqual(plan.days.mi, ['gurkensalat']);
    assert.deepEqual(plan.days.fr, ['carbonara'], 'zweimal dasselbe Rezept muss bleiben');
    assert.deepEqual(plan.days.di, []);
    assert.equal(result.belegteTage, 3);
  });
});

describe('importBackup — löscht nichts', () => {
  it('ein Rezept, das nur in der Zieldatenbank steht, bleibt', () => {
    // Man holt eine Sicherung, weil etwas fehlt — nicht, weil zu viel da ist.
    ziel.saveRecipe({ id: 'neu', title: 'Nach der Sicherung angelegt', servings: 2, ingredients: [] });
    importBackup(ziel, durchDatei(exportBackup(quelle)));

    const titel = ziel.listRecipes().map((r) => r.title);
    assert.ok(titel.includes('Nach der Sicherung angelegt'));
    assert.equal(titel.length, 3);
  });

  it('zweimal einspielen legt keine Dubletten an', () => {
    const b = durchDatei(exportBackup(quelle));
    importBackup(ziel, b);
    const zweiter = importBackup(ziel, b);
    assert.equal(zweiter.neu, 0);
    assert.equal(zweiter.ersetzt, 2);
    assert.equal(ziel.listRecipes().length, 2, 'idempotent');
  });

  it('ein geändertes Rezept wird überschrieben, nicht verdoppelt', () => {
    importBackup(ziel, durchDatei(exportBackup(quelle)));
    ziel.saveRecipe({ ...REZEPTE[0], title: 'Zwischendurch umbenannt' });
    importBackup(ziel, durchDatei(exportBackup(quelle)));
    assert.equal(ziel.getRecipe('carbonara')?.title, 'Carbonara wie bei der Mamma in Rom');
    assert.equal(ziel.listRecipes().length, 2);
  });
});

describe('importBackup — weist Unsinn ab, bevor etwas geschrieben wird', () => {
  const schlecht: [string, unknown][] = [
    ['kein Objekt', 'nur ein String'],
    ['null', null],
    ['fremde JSON-Datei', { irgendwas: true }],
    ['falsche App', { app: 'anderes', format: 1, recipes: [{ id: 'x', title: 'X' }] }],
    ['unbekanntes Format', { app: 'grocify', format: 99, recipes: [{ id: 'x', title: 'X' }] }],
    ['keine Rezepte', { app: 'grocify', format: 1, recipes: [] }],
    ['recipes ist keine Liste', { app: 'grocify', format: 1, recipes: 'Carbonara' }],
  ];

  for (const [was, data] of schlecht) {
    it(`lehnt ab: ${was}`, () => {
      assert.throws(() => importBackup(ziel, data), BackupError);
      assert.equal(ziel.listRecipes().length, 0, 'nichts darf geschrieben worden sein');
    });
  }

  it('überspringt einzelne Rezepte ohne id oder title, statt alles abzubrechen', () => {
    const b = exportBackup(quelle) as unknown as { recipes: unknown[] };
    b.recipes.push({ title: 'ohne id' }, { id: 'ohne-titel' });
    const result = importBackup(ziel, durchDatei(b));
    assert.equal(result.neu, 2);
    assert.equal(result.uebersprungen, 2);
  });

  it('erfundene Wochentage landen nicht in der Datenbank', () => {
    const b = exportBackup(quelle) as unknown as { weekPlan: { days: Record<string, unknown> } };
    b.weekPlan.days.montag = ['carbonara'];
    b.weekPlan.days.mo = ['carbonara', 42, null];
    importBackup(ziel, durchDatei(b));

    const plan = ziel.getWeekPlan();
    assert.equal(Object.keys(plan.days).length, 7);
    assert.deepEqual(plan.days.mo, ['carbonara'], 'nur Zeichenketten');
  });
});
