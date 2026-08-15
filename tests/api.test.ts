/**
 * HTTP-API.
 *
 * Startet einen echten Server auf einem freien Port gegen eine
 * Wegwerf-Datenbank. Kein Netzwerk nach außen, keine Portkollision mit dem
 * laufenden Backend auf 4000 — der Kernel vergibt den Port über `listen(0)`.
 *
 * Der Schwerpunkt liegt auf der Eingabeprüfung. Ein Backend, das alles
 * annimmt, was ihm geschickt wird, verlagert seine Fehler nur nach hinten:
 * Dann steht Unsinn in der Datenbank und fällt erst beim Lesen auf.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createApi } from '../server/api';
import { GrocifyDb } from '../server/db';

let server: Server;
let base: string;
let db: GrocifyDb;
let dir: string;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'grocify-api-'));
  db = new GrocifyDb(join(dir, 'test.db'));
  server = createApi(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Kein Port erhalten');
  base = `http://127.0.0.1:${addr.port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: res.headers };
}

const gueltig = {
  title: 'Testrezept',
  servings: 2,
  ingredients: [
    {
      id: 'mehl',
      name: 'Mehl',
      quantity: { amount: 300, unit: 'g' },
      rawText: '300 g Mehl',
      isPantryStaple: true,
    },
  ],
};

describe('API — Grundlagen', () => {
  it('GET /health meldet den Bestand', async () => {
    const { status, body } = await call('/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.recipes, 'number');
  });

  it('unbekannte Route gibt 404 mit Klartext', async () => {
    const { status, body } = await call('/gibtsnicht');
    assert.equal(status, 404);
    assert.match(body.error, /Keine Route/);
  });

  it('CORS ist freigegeben — der Entwicklungsserver läuft auf einem anderen Port', async () => {
    const { headers } = await call('/health');
    assert.equal(headers.get('access-control-allow-origin'), '*');
  });

  it('OPTIONS wird ohne Inhalt beantwortet', async () => {
    const res = await fetch(`${base}/recipes`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
  });
});

describe('API — Rezepte', () => {
  it('startet mit leerer Liste', async () => {
    const { status, body } = await call('/recipes');
    assert.equal(status, 200);
    assert.deepEqual(body, []);
  });

  it('PUT legt an und gibt das gespeicherte Rezept zurück', async () => {
    const { status, body } = await call('/recipes/r1', {
      method: 'PUT',
      body: JSON.stringify(gueltig),
    });
    assert.equal(status, 200);
    assert.equal(body.id, 'r1');
    assert.equal(body.ingredients.length, 1);
  });

  it('die ID aus dem Pfad gewinnt gegen die im Körper', async () => {
    // Sonst könnte ein Aufruf an /api/recipes/A ein Rezept mit der ID B
    // anlegen — und der Aufrufer bekäme etwas anderes, als er erwartet.
    const { body } = await call('/recipes/r2', {
      method: 'PUT',
      body: JSON.stringify({ ...gueltig, id: 'geschmuggelt' }),
    });
    assert.equal(body.id, 'r2');
    assert.equal((await call('/recipes/geschmuggelt')).status, 404);
  });

  it('GET auf ein unbekanntes Rezept gibt 404', async () => {
    const { status, body } = await call('/recipes/nix');
    assert.equal(status, 404);
    assert.match(body.error, /gibt es nicht/);
  });

  it('DELETE meldet Erfolg und dann 404', async () => {
    assert.equal((await call('/recipes/r2', { method: 'DELETE' })).status, 200);
    assert.equal((await call('/recipes/r2', { method: 'DELETE' })).status, 404);
  });
});

describe('API — Eingabeprüfung', () => {
  const abgelehnt: [string, unknown][] = [
    ['kein Objekt', 'nur ein String'],
    ['Titel fehlt', { servings: 2, ingredients: [] }],
    ['Titel leer', { title: '   ', servings: 2, ingredients: [] }],
    ['servings keine Zahl', { title: 'X', servings: 'zwei', ingredients: [] }],
    ['servings unter 1', { title: 'X', servings: 0, ingredients: [] }],
    ['ingredients keine Liste', { title: 'X', servings: 2, ingredients: 'Mehl' }],
    ['Zutat ohne Namen', { title: 'X', servings: 2, ingredients: [{ quantity: { amount: 1 } }] }],
    [
      'Zutat ohne Menge',
      { title: 'X', servings: 2, ingredients: [{ name: 'Mehl' }] },
    ],
  ];

  for (const [was, payload] of abgelehnt) {
    it(`weist ab: ${was}`, async () => {
      const { status, body } = await call('/recipes/bad', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      assert.equal(status, 400, `${was} sollte 400 geben`);
      assert.ok(body.error, 'Fehlermeldung im Klartext erwartet');
    });
  }

  it('kaputtes JSON gibt 400 statt 500', async () => {
    const res = await fetch(`${base}/recipes/x`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{ das ist kein JSON',
    });
    assert.equal(res.status, 400);
  });

  it('nichts Abgelehntes landet in der Datenbank', async () => {
    assert.equal((await call('/recipes/bad')).status, 404);
  });
});

describe('API — Wochenplan', () => {
  it('GET liefert einen leeren Plan mit sieben Tagen', async () => {
    const { status, body } = await call('/week-plan');
    assert.equal(status, 200);
    assert.equal(Object.keys(body.days).length, 7);
  });

  it('PUT speichert Tage', async () => {
    const plan = {
      name: 'Testwoche',
      days: { mo: ['r1'], di: [], mi: [], do: [], fr: [], sa: [], so: [] },
    };
    const { status, body } = await call('/week-plan', { method: 'PUT', body: JSON.stringify(plan) });
    assert.equal(status, 200);
    assert.deepEqual(body.days.mo, ['r1']);
  });

  it('erfundene Wochentage werden ignoriert statt gespeichert', async () => {
    const plan = { name: 'X', days: { mo: ['r1'], montag: ['r1'], 42: ['r1'] } };
    const { status, body } = await call('/week-plan', { method: 'PUT', body: JSON.stringify(plan) });
    assert.equal(status, 200);
    assert.equal(Object.keys(body.days).length, 7);
    assert.equal(body.days.montag, undefined);
  });

  it('Einträge, die keine Zeichenketten sind, fallen heraus', async () => {
    const plan = { name: 'X', days: { mo: ['r1', 42, null, { id: 'x' }] } };
    const { body } = await call('/week-plan', { method: 'PUT', body: JSON.stringify(plan) });
    assert.deepEqual(body.days.mo, ['r1']);
  });
});

describe('API — Import', () => {
  it('Suche ohne Begriff gibt 400 statt einer leeren Anfrage an Chefkoch', async () => {
    const { status, body } = await call('/import/search');
    assert.equal(status, 400);
    assert.match(body.error, /Suchbegriff/);
  });

  it('leerer Begriff zählt wie kein Begriff', async () => {
    assert.equal((await call('/import/search?q=%20%20')).status, 400);
  });
});
