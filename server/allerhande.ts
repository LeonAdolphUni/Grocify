/**
 * Rezept-Import aus Albert Heijns Allerhande.
 *
 * **Warum Allerhande und nicht mehr Chefkoch.** Ein deutsches Rezept muss
 * übersetzt werden, bevor man es im niederländischen Regal suchen kann —
 * „Schmand" wird zu „creme fraiche", „Hühnerbrühe" zu „bouillon". Diese Kette
 * war die größte Fehlerquelle der App: ein Wörterbuch mit hundert Einträgen,
 * eine Kompositum-Zerlegung, ein Rückfall aufs Grundwort, und am Ende immer
 * noch Zutaten, die nichts fanden.
 *
 * Allerhande-Rezepte sind Albert Heijns eigene. Ihre Zutaten stehen bereits
 * auf Niederländisch und tragen die Namen, unter denen AH die Produkte führt
 * — „biologische volkorenpenne" ist kein Übersetzungsproblem, sondern ein
 * Suchbegriff. **Was hier importiert wird, gibt es im Laden.**
 *
 * Gelesen wird das schema.org-`Recipe`-JSON-LD der Rezeptseite. Das ist
 * strukturierte Auszeichnung, die AH ausdrücklich für Maschinen
 * veröffentlicht: Ihre `robots.txt` nennt eine eigene Sitemap für Rezepte
 * (`/sitemaps/entities/allerhande/recipes.xml`) und vermerkt „ALLERHANDE
 * OPTIMALISATIE — Minder restrictief voor SEO". Gesperrt sind dort
 * Nutzerbereiche und Mehrfachfilter (`/allerhande/*?*&*`), nicht die Rezepte.
 *
 * ⚠️ Wie bei der Produktsuche gilt: keine lizenzierte Schnittstelle, keine
 * Verfügbarkeitszusage. Ändert AH das Seitengerüst, ist es diese eine Datei.
 *
 * **Der Zubereitungstext wird nicht übernommen** — dieselbe Entscheidung wie
 * beim alten Chefkoch-Import. Zutatenlisten sind in der Regel nicht
 * urheberrechtlich geschützt, Zubereitungstexte schon, und zum Planen eines
 * Einkaufs braucht die App sie nicht. Zum Kochen führt der Link zum Original.
 */

import { parseDutchIngredient, parseDutchNutritionValue, parseIsoDuration } from '../src/domain/parseDutch';
import { isPantryStaple, normalizeKey } from '../src/domain/translate';
import type { Ingredient, Recipe } from '../src/domain/types';

const BASE = 'https://www.ah.nl';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'nl-NL,nl;q=0.9',
} as const;

export class AllerhandeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AllerhandeError';
  }
}

/** Ein Suchtreffer für die Trefferliste. */
export interface RecipeHit {
  /** AHs Rezept-ID, z. B. „R-R1302810". */
  id: string;
  title: string;
  /** Pfad ohne Domain — wird zum Nachladen gebraucht. */
  path: string;
  imageUrl?: string;
}

/** Nährwerte je Portion, wie AH sie selbst angibt. */
export interface AllerhandeNutrition {
  kcal?: number;
  fat?: number;
  saturatedFat?: number;
  carbs?: number;
  protein?: number;
}

async function getHtml(path: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  } catch (err) {
    throw new AllerhandeError(`Albert Heijn nicht erreichbar: ${(err as Error).message}`);
  }
  if (!res.ok) {
    throw new AllerhandeError(`Albert Heijn antwortete mit HTTP ${res.status}`, res.status);
  }
  return res.text();
}

/**
 * Liest alle `Recipe`-Blöcke aus dem JSON-LD einer Seite.
 *
 * Auf einer Seite stehen mehrere Blöcke — Organization, WebSite,
 * BreadcrumbList und, wenn es eine Rezeptseite ist, Recipe. Gesucht wird
 * gezielt der letzte.
 */
function extractRecipeJsonLd(html: string): Record<string, unknown> | null {
  for (const m of html.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue; // Ein kaputter Block ist kein Grund aufzugeben.
    }
    const kandidaten = Array.isArray(data) ? data : [data];
    for (const k of kandidaten) {
      if (k && typeof k === 'object' && (k as { '@type'?: string })['@type'] === 'Recipe') {
        return k as Record<string, unknown>;
      }
    }
  }
  return null;
}

/** Aus „/allerhande/recept/R-R1302810/romige-green-goddess-pasta" wird „R-R1302810". */
function idFromPath(path: string): string {
  return /\/recept\/([^/]+)/.exec(path)?.[1] ?? path;
}

/**
 * Sucht Rezepte bei Allerhande.
 *
 * Die Trefferliste wird aus den Rezeptlinks der Suchseite gelesen. Titel und
 * Bild stehen dort nicht zuverlässig im Klartext — deshalb wird der Titel aus
 * dem Link-Slug gebildet („romige-green-goddess-pasta" → „Romige green
 * goddess pasta"). Der echte Titel kommt beim Import aus dem JSON-LD.
 */
export async function searchRecipes(query: string, limit = 20): Promise<RecipeHit[]> {
  const term = query.trim();
  if (!term) return [];

  // Bewusst genau ein Abfrageparameter: AHs robots.txt sperrt
  // `/allerhande/*?*&*`, also URLs mit zwei oder mehr Parametern.
  const html = await getHtml(`/allerhande/recepten-zoeken?query=${encodeURIComponent(term)}`);

  const gesehen = new Set<string>();
  const treffer: RecipeHit[] = [];

  for (const m of html.matchAll(/href="(\/allerhande\/recept\/([^/"]+)\/([^"]+))"/g)) {
    const [, path, id, slug] = m;
    if (gesehen.has(id)) continue;
    gesehen.add(id);

    treffer.push({
      id,
      path,
      title: titleFromSlug(slug),
      imageUrl: undefined,
    });
    if (treffer.length >= limit) break;
  }

  return treffer;
}

/** „romige-green-goddess-pasta" → „Romige green goddess pasta". */
function titleFromSlug(slug: string): string {
  const worte = slug.replace(/-/g, ' ').trim();
  return worte.charAt(0).toUpperCase() + worte.slice(1);
}

export interface ImportedRecipe {
  recipe: Recipe;
  /** AHs eigene Nährwerte je Portion — genauer als jede Schätzung. */
  nutrition?: AllerhandeNutrition;
  /** Zubereitungszeit in Minuten. */
  totalMinutes?: number;
  /** Für wen es geeignet ist, z. B. „VegetarianDiet". */
  diets: string[];
}

/**
 * Holt ein Rezept und übersetzt es in unser Modell.
 *
 * Der Zutatenname wird **unverändert** als Suchbegriff übernommen. Das ist
 * der ganze Sinn der Umstellung: AH schreibt in seine Rezepte die Namen, unter
 * denen es die Produkte verkauft.
 */
export async function importRecipe(idOrPath: string, newRecipeId: string): Promise<ImportedRecipe> {
  const path = idOrPath.startsWith('/') ? idOrPath : `/allerhande/recept/${idOrPath}`;
  const html = await getHtml(path);

  const ld = extractRecipeJsonLd(html);
  if (!ld) {
    throw new AllerhandeError('Auf dieser Seite steht kein Rezept (kein Recipe-JSON-LD).');
  }

  const zeilen = Array.isArray(ld.recipeIngredient) ? (ld.recipeIngredient as string[]) : [];
  const ingredients: Ingredient[] = [];

  for (const zeile of zeilen) {
    if (typeof zeile !== 'string') continue;
    const parsed = parseDutchIngredient(zeile);
    if (!parsed) continue;

    ingredients.push({
      id: normalizeKey(parsed.name),
      name: parsed.name,
      // Kein Übersetzungsschritt: Der Name IST der Suchbegriff.
      searchTermNl: parsed.name,
      quantity: parsed.quantity,
      rawText: parsed.raw,
      isPantryStaple: isPantryStaple(parsed.name) || isDutchStaple(parsed.name),
    });
  }

  if (ingredients.length === 0) {
    throw new AllerhandeError('Das Rezept enthält keine verwertbaren Zutaten');
  }

  const servings = Number(ld.recipeYield);
  const n = (ld.nutrition ?? {}) as Record<string, string>;

  return {
    recipe: {
      id: newRecipeId,
      title: typeof ld.name === 'string' ? ld.name.trim() : 'Zonder titel',
      servings: Number.isFinite(servings) && servings >= 1 ? Math.round(servings) : 4,
      ingredients,
      sourceUrl: typeof ld.url === 'string' ? ld.url : `${BASE}${path}`,
      // instructions bleibt bewusst leer — siehe Dateikopf.
    },
    nutrition: {
      kcal: parseDutchNutritionValue(n.calories),
      fat: parseDutchNutritionValue(n.fatContent),
      saturatedFat: parseDutchNutritionValue(n.saturatedFatContent),
      carbs: parseDutchNutritionValue(n.carbohydrateContent),
      protein: parseDutchNutritionValue(n.proteinContent),
    },
    totalMinutes: parseIsoDuration(typeof ld.totalTime === 'string' ? ld.totalTime : undefined),
    diets: Array.isArray(ld.suitableForDiet) ? (ld.suitableForDiet as string[]) : [],
  };
}

/**
 * Niederländische Vorratsware.
 *
 * `isPantryStaple` kennt die deutschen Namen. Allerhande liefert „zout",
 * „peper" und „olijfolie" — ohne diese Liste stünde Salz jede Woche auf der
 * Einkaufsliste.
 */
const NL_STAPLES = new Set([
  'zout',
  'peper',
  'zwarte_peper',
  'suiker',
  'water',
  'olie',
  'olijfolie',
  'zonnebloemolie',
  'milde_olijfolie',
  'azijn',
  'bloem',
  'tarwebloem',
  'bakpoeder',
  'peper_en_zout',
]);

function isDutchStaple(name: string): boolean {
  const key = normalizeKey(name);
  if (NL_STAPLES.has(key)) return true;
  // „extra vergine olijfolie" endet auf „olijfolie".
  return [...NL_STAPLES].some((s) => s.length >= 4 && key.endsWith(s));
}
