/**
 * Zugriff auf das Backend.
 *
 * Ersetzt die frühere Speicherung im Browser. Der Unterschied ist nicht nur
 * technisch: AsyncStorage hing an genau einem Browser auf genau einem
 * Rechner — leerst du den Browserspeicher, sind die Rezepte weg. Jetzt
 * liegen sie in einer Datenbankdatei, die du sichern und mitnehmen kannst.
 */

import type { Recipe } from '../domain/types';
import type { WeekPlan } from '../domain/weekPlan';

/**
 * Wo das Backend läuft.
 *
 * Im Browser wird der Hostname der geöffneten Seite übernommen, damit es
 * auch funktioniert, wenn die App nicht über `localhost` aufgerufen wird.
 * Der Port ist fest, weil das Backend ihn fest belegt.
 */
const PORT = 4000;

function baseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:${PORT}/api`;
  }
  return `http://localhost:${PORT}/api`;
}

/** Fehler, den die Oberfläche dem Nutzer zeigen kann. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Backend nicht erreichbar — anderer Fall als „Anfrage abgelehnt". */
    readonly offline = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    // Ein fehlgeschlagenes fetch heißt fast immer: Der Server läuft nicht.
    // Das ist die häufigste Ursache und verdient eine klare Ansage statt
    // eines technischen Netzwerkfehlers.
    throw new ApiError(
      'Das Backend antwortet nicht. Läuft es? Starte es mit "npm run server".',
      undefined,
      true,
    );
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Antwort ohne verwertbaren Körper — der Status muss reichen.
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

export const api = {
  /** Prüft, ob das Backend erreichbar ist. */
  health: () =>
    request<{ status: string; recipes: number; ingredients: number; plannedMeals: number }>(
      '/health',
    ),

  listRecipes: () => request<Recipe[]>('/recipes'),

  saveRecipe: (recipe: Recipe) =>
    request<Recipe>(`/recipes/${encodeURIComponent(recipe.id)}`, {
      method: 'PUT',
      body: JSON.stringify(recipe),
    }),

  deleteRecipe: (id: string) =>
    request<{ deleted: string }>(`/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getWeekPlan: () => request<WeekPlan>('/week-plan'),

  saveWeekPlan: (plan: WeekPlan) =>
    request<WeekPlan>('/week-plan', { method: 'PUT', body: JSON.stringify(plan) }),
};
