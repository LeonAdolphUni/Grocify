/**
 * HTTP-API des Backends.
 *
 * Bewusst mit dem eingebauten `node:http` statt Express oder Hono. Für ein
 * gutes Dutzend Routen ist ein Framework mehr Abhängigkeit als Ersparnis,
 * und jede zusätzliche Abhängigkeit ist auf diesem Rechner ein Risiko —
 * npm-Installationen sind hier schon mehrfach mit Warnungen und
 * Skript-Freigaben aufgefallen.
 *
 * Alles hier ist gewöhnliches HTTP: Routen als Tabelle, JSON rein, JSON
 * raus, CORS offen für den lokalen Entwicklungsserver.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { newId } from '../src/domain/id';
import type { PantryItem } from '../src/domain/pantry';
import type { Settings } from '../src/domain/settings';
import type { Recipe } from '../src/domain/types';
import { emptyWeek, WEEKDAYS, type WeekPlan } from '../src/domain/weekPlan';
import { ChefkochError, importRecipe, searchRecipes } from './chefkoch';
import { GrocifyDb, PLAN_ID } from './db';

interface Route {
  method: string;
  /** Pfadmuster; `:id` fängt ein Segment. */
  path: string;
  handle: (ctx: Ctx) => unknown | Promise<unknown>;
}

interface Ctx {
  params: Record<string, string>;
  /** Werte aus dem Fragezeichen-Teil der URL. */
  query: Record<string, string>;
  body: unknown;
  db: GrocifyDb;
}

/** Fehler mit HTTP-Status — vom Handler geworfen, oben übersetzt. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const ROUTES: Route[] = [
  {
    method: 'GET',
    path: '/api/health',
    handle: ({ db }) => ({ status: 'ok', ...db.stats() }),
  },

  {
    method: 'GET',
    path: '/api/recipes',
    handle: ({ db }) => db.listRecipes(),
  },

  {
    method: 'GET',
    path: '/api/recipes/:id',
    handle: ({ db, params }) => {
      const recipe = db.getRecipe(params.id);
      if (!recipe) throw new HttpError(404, `Rezept ${params.id} gibt es nicht`);
      return recipe;
    },
  },

  {
    method: 'PUT',
    path: '/api/recipes/:id',
    handle: ({ db, params, body }) => {
      const recipe = assertRecipe(body, params.id);
      return db.saveRecipe(recipe);
    },
  },

  {
    method: 'DELETE',
    path: '/api/recipes/:id',
    handle: ({ db, params }) => {
      if (!db.deleteRecipe(params.id)) {
        throw new HttpError(404, `Rezept ${params.id} gibt es nicht`);
      }
      return { deleted: params.id };
    },
  },

  {
    method: 'GET',
    path: '/api/week-plan',
    handle: ({ db }) => db.getWeekPlan(),
  },

  // ── Import von Chefkoch ────────────────────────────────────────────────
  // Läuft hier statt im Browser: Der käme wegen CORS nicht durch, und
  // Änderungen an Chefkochs Schnittstelle bleiben so auf eine Datei
  // beschränkt.

  {
    method: 'GET',
    path: '/api/import/search',
    handle: async ({ query }) => {
      const term = (query.q ?? '').trim();
      if (!term) throw new HttpError(400, 'Suchbegriff fehlt (?q=…)');
      return searchRecipes(term, Math.min(40, Number(query.limit) || 20));
    },
  },

  {
    method: 'POST',
    path: '/api/import/:chefkochId',
    handle: async ({ db, params }) => {
      // Eigene ID vergeben: Chefkochs ID gehört Chefkoch, und das Rezept
      // liegt ab jetzt in deinem Buch. Die Herkunft steht in sourceUrl.
      const fetched = await importRecipe(params.chefkochId, newId());

      // Schon einmal geholt? Dann den vorhandenen Stand zurückgeben statt
      // eine zweite Kopie anzulegen. Wer das Rezept inzwischen angepasst hat
      // — andere Mengen, ein festgelegtes Produkt — behält seine Änderungen.
      const existing = fetched.sourceUrl ? db.findRecipeBySourceUrl(fetched.sourceUrl) : null;
      if (existing) return { recipe: existing, alreadyInBook: true };

      return { recipe: db.saveRecipe(fetched), alreadyInBook: false };
    },
  },

  {
    method: 'PUT',
    path: '/api/week-plan',
    handle: ({ db, body }) => db.saveWeekPlan(assertWeekPlan(body)),
  },

  // ── Einstellungen ──────────────────────────────────────────────────────

  {
    method: 'GET',
    path: '/api/settings',
    handle: ({ db }) => db.getSettings(),
  },

  {
    method: 'PUT',
    path: '/api/settings',
    handle: ({ db, body }) => {
      if (typeof body !== 'object' || body === null) {
        throw new HttpError(400, 'Erwartet wird ein Einstellungs-Objekt');
      }
      const s = body as Partial<Settings>;
      const portionen = Number(s.servingsPerMeal);
      if (!Number.isFinite(portionen) || portionen < 1 || portionen > 12) {
        throw new HttpError(400, 'servingsPerMeal muss zwischen 1 und 12 liegen');
      }
      return db.saveSettings({ servingsPerMeal: Math.round(portionen) });
    },
  },

  // ── Vorrat ─────────────────────────────────────────────────────────────

  {
    method: 'GET',
    path: '/api/pantry',
    handle: ({ db }) => db.listPantry(),
  },

  {
    method: 'PUT',
    path: '/api/pantry/:id',
    handle: ({ db, params, body }) => db.savePantryItem(assertPantryItem(body, params.id)),
  },

  {
    method: 'DELETE',
    path: '/api/pantry/:id',
    handle: ({ db, params }) => {
      if (!db.deletePantryItem(params.id)) {
        throw new HttpError(404, `Vorratseintrag ${params.id} gibt es nicht`);
      }
      return { deleted: params.id };
    },
  },
];

/**
 * Prüft die Eingabe, bevor sie in die Datenbank geht.
 *
 * Ein Backend, das alles annimmt, was ihm geschickt wird, verlagert seine
 * Fehler nur nach hinten — dann steht Unsinn in der Datenbank und fällt
 * erst beim Lesen auf.
 */
function assertRecipe(body: unknown, id: string): Recipe {
  if (typeof body !== 'object' || body === null) {
    throw new HttpError(400, 'Erwartet wird ein Rezept-Objekt');
  }
  const r = body as Partial<Recipe>;

  if (typeof r.title !== 'string' || !r.title.trim()) {
    throw new HttpError(400, 'title fehlt oder ist leer');
  }
  if (typeof r.servings !== 'number' || r.servings < 1) {
    throw new HttpError(400, 'servings muss eine Zahl ab 1 sein');
  }
  if (!Array.isArray(r.ingredients)) {
    throw new HttpError(400, 'ingredients muss eine Liste sein');
  }

  for (const [index, ing] of r.ingredients.entries()) {
    if (!ing || typeof ing.name !== 'string' || !ing.name.trim()) {
      throw new HttpError(400, `Zutat ${index + 1}: name fehlt`);
    }
    if (!ing.quantity || typeof ing.quantity.amount !== 'number') {
      throw new HttpError(400, `Zutat ${index + 1} (${ing.name}): quantity.amount fehlt`);
    }
  }

  // Die ID aus dem Pfad gewinnt — sonst könnte ein Aufruf an
  // /api/recipes/A ein Rezept mit der ID B anlegen.
  return { ...(r as Recipe), id };
}

/**
 * Prüft einen Vorratseintrag.
 *
 * Strenger als es scheint: Eine Menge von 0 oder weniger ist kein Vorrat,
 * sondern die Aussage „habe ich nicht" — und die gehört als Löschung
 * ausgedrückt, nicht als Eintrag. Sonst zieht die Einkaufsliste später
 * Nullmengen ab und niemand versteht, warum nichts passiert.
 */
function assertPantryItem(body: unknown, id: string): PantryItem {
  if (typeof body !== 'object' || body === null) {
    throw new HttpError(400, 'Erwartet wird ein Vorrats-Objekt');
  }
  const p = body as Partial<PantryItem>;

  if (typeof p.name !== 'string' || !p.name.trim()) {
    throw new HttpError(400, 'name fehlt oder ist leer');
  }
  if (!p.quantity || typeof p.quantity.amount !== 'number' || Number.isNaN(p.quantity.amount)) {
    throw new HttpError(400, 'quantity.amount fehlt oder ist keine Zahl');
  }
  if (p.quantity.amount <= 0) {
    throw new HttpError(400, 'Menge muss größer als 0 sein — sonst lösche den Eintrag');
  }
  if (typeof p.quantity.unit !== 'string' || !p.quantity.unit) {
    throw new HttpError(400, 'quantity.unit fehlt');
  }

  return {
    id,
    name: p.name.trim(),
    quantity: p.quantity,
    note: typeof p.note === 'string' && p.note.trim() ? p.note.trim() : undefined,
    updatedAt: new Date().toISOString(),
  };
}

function assertWeekPlan(body: unknown): WeekPlan {
  if (typeof body !== 'object' || body === null) {
    throw new HttpError(400, 'Erwartet wird ein Wochenplan-Objekt');
  }
  const p = body as Partial<WeekPlan>;
  const plan = emptyWeek(PLAN_ID, typeof p.name === 'string' ? p.name : 'Meine Woche');

  if (p.days && typeof p.days === 'object') {
    for (const day of WEEKDAYS) {
      const value = (p.days as Record<string, unknown>)[day];
      if (Array.isArray(value)) {
        plan.days[day] = value.filter((x): x is string => typeof x === 'string');
      }
    }
  }
  return plan;
}

/** Gleicht einen Pfad gegen ein Muster ab und liefert die Platzhalter. */
function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/');
  const b = path.split('/');
  if (a.length !== b.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('error', reject);
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'Körper ist kein gültiges JSON'));
      }
    });
  });
}

function send(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload ?? null);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    // Der Entwicklungsserver läuft auf einem anderen Port als das Backend,
    // also braucht der Browser die Freigabe.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

export function createApi(db: GrocifyDb) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const query = Object.fromEntries(url.searchParams);
    const method = req.method ?? 'GET';

    if (method === 'OPTIONS') return send(res, 204, null);

    const route = ROUTES.map((r) => ({ r, params: match(r.path, path) })).find(
      (x) => x.params !== null && x.r.method === method,
    );

    if (!route || !route.params) {
      return send(res, 404, { error: `Keine Route für ${method} ${path}` });
    }

    try {
      const body = method === 'PUT' || method === 'POST' ? await readBody(req) : undefined;
      const result = await route.r.handle({ params: route.params, query, body, db });
      send(res, 200, result);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      // Fremde Quelle ausgefallen ist kein Serverfehler bei uns — 502 sagt
      // dem Frontend, dass es an Chefkoch liegt und nicht am Backend.
      if (err instanceof ChefkochError) return send(res, 502, { error: err.message });
      console.error('[api]', err);
      send(res, 500, { error: (err as Error).message });
    }
  });
}
