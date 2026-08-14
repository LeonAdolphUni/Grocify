/**
 * Prüft das Backend Ende zu Ende gegen eine echte Datenbank.
 *
 *   npm run smoke:api
 *
 * Startet einen eigenen Server auf einer Wegwerf-Datenbank, spielt den
 * kompletten Ablauf durch — anlegen, lesen, ändern, in den Wochenplan
 * legen, löschen — und räumt danach auf. Der laufende Entwicklungsserver
 * wird dabei nicht angefasst.
 */

import { rmSync } from 'node:fs';

import { createApi } from '../server/api';
import { GrocifyDb } from '../server/db';
import { emptyWeek } from '../src/domain/weekPlan';
import type { Recipe } from '../src/domain/types';

const PORT = 4099;
const DB_FILE = 'server/data/test-smoke.db';
const BASE = `http://localhost:${PORT}/api`;

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${!ok && detail ? `  — ${detail}` : ''}`);
}

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  return { status: res.status, body: (await res.json()) as T };
}

const RECIPE: Recipe = {
  id: 'test-1',
  title: 'Testgericht',
  servings: 2,
  ingredients: [
    {
      id: 'milch',
      name: 'Milch',
      searchTermNl: 'melk',
      quantity: { amount: 0.5, unit: 'l' },
      rawText: '0.5 l Milch',
      isPantryStaple: false,
      pinnedProduct: {
        provider: 'albert-heijn',
        id: '12345',
        title: 'AH Halfvolle melk',
        packageSize: '0,5 l',
      },
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

async function main() {
  rmSync(DB_FILE, { force: true });
  const db = new GrocifyDb(DB_FILE);
  const server = createApi(db);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  console.log('\n── Backend Ende zu Ende ──\n');

  try {
    const health = await call<{ status: string; recipes: number }>('/health');
    check('Gesundheitscheck antwortet', health.status === 200 && health.body.status === 'ok');
    check('Frische Datenbank ist leer', health.body.recipes === 0);

    const saved = await call<Recipe>('/recipes/test-1', {
      method: 'PUT',
      body: JSON.stringify(RECIPE),
    });
    check('Rezept anlegen', saved.status === 200 && saved.body.id === 'test-1');
    check('Zutaten vollständig gespeichert', saved.body.ingredients.length === 2);
    check(
      'Gemerktes Produkt überlebt die Datenbank',
      saved.body.ingredients[0].pinnedProduct?.title === 'AH Halfvolle melk',
    );
    check(
      'Vorratsware behält ihr Kennzeichen',
      saved.body.ingredients[1].isPantryStaple === true,
    );
    check(
      'Kommazahl bleibt erhalten',
      saved.body.ingredients[0].quantity.amount === 0.5,
      `war ${saved.body.ingredients[0].quantity.amount}`,
    );

    const list = await call<Recipe[]>('/recipes');
    check('Liste enthält das Rezept', list.body.length === 1);

    // Ändern: Zutaten werden ersetzt, nicht angehängt
    const changed = await call<Recipe>('/recipes/test-1', {
      method: 'PUT',
      body: JSON.stringify({ ...RECIPE, title: 'Geändert', ingredients: [RECIPE.ingredients[0]] }),
    });
    check('Ändern überschreibt statt anzuhängen', changed.body.ingredients.length === 1);
    check('Neuer Titel gespeichert', changed.body.title === 'Geändert');

    const stillOne = await call<Recipe[]>('/recipes');
    check('Kein Duplikat entstanden', stillOne.body.length === 1);

    // Wochenplan
    const plan = emptyWeek('week-1');
    plan.days.mo = ['test-1'];
    const savedPlan = await call<typeof plan>('/week-plan', {
      method: 'PUT',
      body: JSON.stringify(plan),
    });
    check('Wochenplan speichern', savedPlan.body.days.mo[0] === 'test-1');

    // Unbekanntes Rezept im Plan wird stillschweigend übergangen
    const bogus = emptyWeek('week-1');
    bogus.days.di = ['gibt-es-nicht'];
    const cleaned = await call<typeof plan>('/week-plan', {
      method: 'PUT',
      body: JSON.stringify(bogus),
    });
    check('Unbekanntes Rezept fliegt aus dem Plan', cleaned.body.days.di.length === 0);

    // Eingabeprüfung
    const bad = await call<{ error: string }>('/recipes/x', {
      method: 'PUT',
      body: JSON.stringify({ title: '', servings: 0, ingredients: [] }),
    });
    check('Leerer Titel wird abgelehnt', bad.status === 400, `Status ${bad.status}`);

    const missing = await call<{ error: string }>('/recipes/gibt-es-nicht');
    check('Unbekanntes Rezept ergibt 404', missing.status === 404);

    // Löschen räumt den Wochenplan mit auf
    plan.days.mo = ['test-1'];
    await call('/week-plan', { method: 'PUT', body: JSON.stringify(plan) });
    await call('/recipes/test-1', { method: 'DELETE' });
    const afterDelete = await call<typeof plan>('/week-plan');
    check(
      'Gelöschtes Rezept verschwindet aus dem Wochenplan',
      afterDelete.body.days.mo.length === 0,
    );

    const empty = await call<Recipe[]>('/recipes');
    check('Rezept ist gelöscht', empty.body.length === 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    rmSync(DB_FILE, { force: true });
  }

  console.log(
    failures === 0
      ? '\n✓ Backend arbeitet korrekt.\n'
      : `\n✗ ${failures} Prüfungen fehlgeschlagen.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
