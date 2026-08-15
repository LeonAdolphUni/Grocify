/**
 * Zugriff auf das Backend.
 *
 * Ersetzt die frühere Speicherung im Browser. Der Unterschied ist nicht nur
 * technisch: AsyncStorage hing an genau einem Browser auf genau einem
 * Rechner — leerst du den Browserspeicher, sind die Rezepte weg. Jetzt
 * liegen sie in einer Datenbankdatei, die du sichern und mitnehmen kannst.
 */

import type { PantryItem } from '../domain/pantry';
import type { Settings } from '../domain/settings';
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

/** Ein Vorschlag des Wochenplaners. */
export interface AdvisorPick {
  hit: ImportHit;
  recipe: Recipe;
  score: number;
  reasons: string[];
  kcalPerServing?: number;
  proteinPerServing?: number;
  ingredientCount: number;
  pantryShare: number;
  totalMinutes?: number;
  /** Preis je Portion, wenn das Gericht allein gekauft würde. */
  pricePerServing?: number;
  /** Anteil des Gekauften, der bei diesem Gericht verkocht wird. */
  utilization?: number;
}

export interface AdvisorResult {
  picks: AdvisorPick[];
  /** Wünsche, für die Allerhande nichts hergab. */
  unmatched: string[];
  /** Wie viele Rezeptseiten geholt wurden. */
  fetched: number;
  /** Was die Woche zusammen kostet — mit geteilten Packungen. */
  totalPrice?: number;
  /** Verwertung der ganzen Woche, 0…1. */
  totalUtilization?: number;
  /** Was aussortiert wurde und warum. */
  filtered: { title: string; reason: string }[];
  /** Das Budget ließ sich nicht halten — der Vorschlag liegt darüber. */
  budgetRelaxed?: boolean;
}

/** Was der Nutzer im Planerformular eingestellt hat. */
export interface AdvisorForm {
  wishes: string[];
  days: number;
  /** Obergrenze je Portion in Euro. `undefined` heißt „egal". */
  maxPricePerServing?: number;
  vegetarianOnly?: boolean;
  maxMinutes?: number;
  rejected?: string[];
}

/** Eine Rezeptkategorie im Katalog. */
export interface RecipeCategory {
  slug: string;
  label: string;
  group: string;
}

/** Ein Suchtreffer beim Import aus Allerhande. */
export interface ImportHit {
  id: string;
  title: string;
  /** Pfad auf ah.nl — wird zum Nachladen gebraucht. */
  path: string;
  imageUrl?: string;
}

/** Ergebnis eines Imports. */
export interface ImportResult {
  recipe: Recipe;
  /** War schon da — es wurde nichts überschrieben und nichts doppelt angelegt. */
  alreadyInBook: boolean;
  /** AHs eigene Nährwerte je Portion. */
  nutrition?: {
    kcal?: number;
    fat?: number;
    saturatedFat?: number;
    carbs?: number;
    protein?: number;
  };
  totalMinutes?: number;
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

  getSettings: () => request<Settings>('/settings'),

  saveSettings: (settings: Settings) =>
    request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  listPantry: () => request<PantryItem[]>('/pantry'),

  savePantryItem: (item: PantryItem) =>
    request<PantryItem>(`/pantry/${encodeURIComponent(item.id)}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    }),

  deletePantryItem: (id: string) =>
    request<{ deleted: string }>(`/pantry/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /**
   * Lässt eine Woche aus Allerhande vorschlagen.
   *
   * Dauert bewusst lange: Für jeden Kandidaten wird eine Rezeptseite geholt,
   * und die Anfragen sind gedrosselt, damit AH nicht mit 403 antwortet.
   */
  adviseWeek: (form: AdvisorForm) =>
    request<AdvisorResult>('/advise-week', {
      method: 'POST',
      body: JSON.stringify(form),
    }),

  /** Die geprüften Rezeptkategorien für den Katalog. */
  listCategories: () => request<RecipeCategory[]>('/import/categories'),

  /** Die Rezepte einer Kategorie. */
  browseCategory: (slug: string) =>
    request<ImportHit[]>(`/import/category/${encodeURIComponent(slug)}`),

  /** Rezepte bei Allerhande suchen. Läuft über das Backend, nicht im Browser. */
  searchImport: (query: string) =>
    request<ImportHit[]>(`/import/search?q=${encodeURIComponent(query)}`),

  /** Übernimmt ein gefundenes Rezept ins eigene Buch. */
  importRecipe: (recipeId: string) =>
    request<ImportResult>(`/import/${encodeURIComponent(recipeId)}`, { method: 'POST' }),
};
