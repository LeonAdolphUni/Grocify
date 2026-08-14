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

import type { Recipe } from '../src/domain/types';
import { emptyWeek, WEEKDAYS, type WeekPlan } from '../src/domain/weekPlan';
import { GrocifyDb, PLAN_ID } from './db';

interface Route {
  method: string;
  /** Pfadmuster; `:id` fängt ein Segment. */
  path: string;
  handle: (ctx: Ctx) => unknown | Promise<unknown>;
}

interface Ctx {
  params: Record<string, string>;
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

  {
    method: 'PUT',
    path: '/api/week-plan',
    handle: ({ db, body }) => db.saveWeekPlan(assertWeekPlan(body)),
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
    const path = (req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/';
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
      const result = await route.r.handle({ params: route.params, body, db });
      send(res, 200, result);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      console.error('[api]', err);
      send(res, 500, { error: (err as Error).message });
    }
  });
}
