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
  /**
   * Vorschaubild von AHs Bildserver.
   *
   * Fehlt, wenn es sich aus dem Seitengerüst nicht sicher zuordnen ließ —
   * dann zeigt die Oberfläche das Monogramm. Ein fehlendes Bild ist
   * harmlos, ein falsch zugeordnetes wäre es nicht.
   */
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

/**
 * Mindestabstand zwischen zwei Anfragen an ah.nl, in Millisekunden.
 *
 * Nicht willkürlich: Beim Entwickeln haben schnell aufeinanderfolgende
 * Aufrufe ein **HTTP 403** ausgelöst — AH schützt sich gegen Lastspitzen,
 * und zu Recht. Ein Rezeptimport, der zehn Seiten in einer Sekunde zieht,
 * verhält sich wie ein Scraper, nicht wie ein Nutzer.
 *
 * Eine Sekunde ist langsamer als nötig und schneller als lästig: Der Nutzer
 * wartet beim Suchen ohnehin auf eine Antwort, und beim Planen laufen die
 * Abrufe im Hintergrund.
 */
const MIN_ABSTAND_MS = 1000;

/**
 * Statuscodes, die „gleich wieder" bedeuten und nicht „nie".
 *
 * Alle drei wurden im Betrieb beobachtet: 403 bei schnellen Abrufen
 * hintereinander, 429 als reguläre Drosselung, 503 nach längerem intensiven
 * Zugriff. Keiner davon heißt, dass die Seite weg ist.
 */
const VORUEBERGEHEND = new Set([403, 429, 503]);

let letzterAufruf = 0;

/** Wartet, bis der Mindestabstand seit dem letzten Aufruf vergangen ist. */
async function drossel(): Promise<void> {
  const seit = Date.now() - letzterAufruf;
  if (seit < MIN_ABSTAND_MS) {
    await new Promise((r) => setTimeout(r, MIN_ABSTAND_MS - seit));
  }
  letzterAufruf = Date.now();
}

async function getHtml(path: string, versuch = 0): Promise<string> {
  await drossel();

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  } catch (err) {
    throw new AllerhandeError(`Albert Heijn nicht erreichbar: ${(err as Error).message}`);
  }

  // 403, 429 und 503 heißen „zu schnell", nicht „nie wieder". Einmal warten
  // und erneut versuchen, dann aufgeben — eine Schleife wäre genau das
  // Verhalten, gegen das die Sperre sich richtet.
  //
  // **503 kam erst durch Messen dazu.** Beim Entwickeln antwortete AH nach
  // vielen Abrufen in Folge minutenlang mit 503 statt 403 — dieselbe
  // Drosselung, nur ein anderer Code. Ohne diesen Zweig meldete die App
  // „Albert Heijn antwortete mit HTTP 503" und gab sofort auf.
  if (VORUEBERGEHEND.has(res.status) && versuch < 2) {
    await new Promise((r) => setTimeout(r, 2500 * (versuch + 1)));
    return getHtml(path, versuch + 1);
  }

  if (!res.ok) {
    throw new AllerhandeError(
      VORUEBERGEHEND.has(res.status)
        ? `Albert Heijn nimmt gerade keine Anfragen an (HTTP ${res.status}). ` +
          'Das geht meist von selbst vorbei — warte ein paar Minuten und versuch es erneut.'
        : `Albert Heijn antwortete mit HTTP ${res.status}`,
      res.status,
    );
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

  return collectHits(html, limit);
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
  /**
   * AHs eigene Einordnung, z. B. „hoofdgerecht" oder „borrelhapje".
   *
   * Der Wochenplaner braucht sie, um Snacks und Beilagen von Hauptgerichten
   * zu trennen — ohne sie landeten Joghurtriegel im Abendessen.
   */
  category?: string;
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
      imageUrl: imageFromJsonLd(ld.image) ?? firstRecipeImage(html),
      // instructions bleibt bewusst leer — siehe Dateikopf.
    },
    category: typeof ld.recipeCategory === 'string' ? ld.recipeCategory.toLowerCase() : undefined,
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
  // Grundwürze
  'zout',
  'peper',
  'zwarte_peper',
  'peper_en_zout',
  'suiker',
  'water',
  'bloem',
  'tarwebloem',
  'bakpoeder',
  'maizena',

  // Öl und Essig
  'olie',
  'olijfolie',
  'zonnebloemolie',
  'milde_olijfolie',
  'sesamolie',
  'azijn',
  'balsamicoazijn',
  'witte_wijnazijn',

  // Angebrochene Gläser und Flaschen. **Der eigentliche Zugewinn dieser
  // Liste.** Eine Messung zeigte 7,29 € für Honig, von dem ein Rezept einen
  // Teelöffel braucht, und 3,29 € für Erdnussbutter — beides landete jede
  // Woche neu auf der Liste. Ein Glas Honig hält ein halbes Jahr; es gehört
  // in den Vorrat, nicht in den Wocheneinkauf.
  'honing',
  'vloeibare_honing',
  'pindakaas',
  'mosterd',
  'ketchup',
  'mayonaise',
  'sojasaus',
  'ketjap',
  'ketjap_manis',
  'sambal',
  'ahornsiroop',
  'appelstroop',

  // Trockene Gewürze. Ein Döschen reicht für zwanzig Gerichte.
  'paprikapoeder',
  'gerookte_paprikapoeder',
  'komijnpoeder',
  'komijnzaad',
  'kerriepoeder',
  'chilipoeder',
  'chilivlokken',
  'kaneel',
  'nootmuskaat',
  'kurkuma',
  'gemberpoeder',
  'knoflookpoeder',
  'uienpoeder',
  'laurierblad',
  'italiaanse_kruiden',
  'provencaalse_kruiden',

  // Brühe
  'bouillon',
  'bouillontablet',
  'groentebouillon',
  'kippenbouillon',
  'runderbouillon',
]);

/**
 * Frische Ware, die zufällig wie Vorratsware heißt.
 *
 * „Gedroogde oregano" ist ein Döschen, „verse oregano" ein Töpfchen für
 * 1,99 €, das nach vier Tagen welk ist. Wer das eine wie das andere
 * behandelt, streicht dem Nutzer eine Zutat von der Liste, die er wirklich
 * kaufen muss.
 */
const NL_FRISCH = /^(verse?|vers_)/;

export function isDutchStaple(name: string): boolean {
  const key = normalizeKey(name);
  if (NL_FRISCH.test(key)) return false;
  if (NL_STAPLES.has(key)) return true;
  // „extra vergine olijfolie" endet auf „olijfolie".
  return [...NL_STAPLES].some((s) => s.length >= 4 && key.endsWith(s));
}

/* ── Katalog ───────────────────────────────────────────────────────── */

export interface RecipeCategory {
  /** Der Pfad-Abschnitt bei AH, z. B. „kip". */
  slug: string;
  label: string;
  /** Oberer Reiter, unter dem die Kategorie steht. */
  group: 'Gerichte' | 'Küchen' | 'Art' | 'Ernährung';
}

/**
 * Rezeptkategorien von Allerhande.
 *
 * Jeder Eintrag wurde einzeln geprüft: Von 32 vermuteten Slugs lieferten
 * nur diese 21 tatsächlich Rezepte — „vlees", „vis" und „ontbijt" gibt es
 * als Seite gar nicht (404), „wraps" und „risotto" antworten mit 403. Eine
 * Kategorie, die ins Leere führt, ist schlimmer als eine fehlende.
 *
 * Die Gruppen sind unsere Ordnung, nicht AHs: Sie tragen die Reiter der
 * Katalogansicht.
 */
export const CATEGORIES: RecipeCategory[] = [
  { slug: 'kip', label: 'Hähnchen', group: 'Gerichte' },
  { slug: 'pasta', label: 'Pasta', group: 'Gerichte' },
  { slug: 'soep', label: 'Suppen', group: 'Gerichte' },
  { slug: 'salades', label: 'Salate', group: 'Gerichte' },
  { slug: 'curry', label: 'Curry', group: 'Gerichte' },
  { slug: 'pizza', label: 'Pizza', group: 'Gerichte' },
  { slug: 'rijst', label: 'Reis', group: 'Gerichte' },
  { slug: 'couscous', label: 'Couscous', group: 'Gerichte' },
  { slug: 'stamppot', label: 'Stamppot', group: 'Gerichte' },
  { slug: 'lunch', label: 'Mittagessen', group: 'Gerichte' },

  { slug: 'italiaanse-recepten', label: 'Italienisch', group: 'Küchen' },
  { slug: 'aziatische-recepten', label: 'Asiatisch', group: 'Küchen' },
  { slug: 'mexicaanse-recepten', label: 'Mexikanisch', group: 'Küchen' },
  { slug: 'midden-oosterse-recepten', label: 'Orientalisch', group: 'Küchen' },

  { slug: 'makkelijke-recepten', label: 'Einfach', group: 'Art' },
  { slug: 'eenpansgerechten', label: 'Ein Topf', group: 'Art' },
  { slug: 'airfryer-recepten', label: 'Heißluftfritteuse', group: 'Art' },
  { slug: 'slowcooker-recepten', label: 'Schongarer', group: 'Art' },

  { slug: 'gezonde-recepten', label: 'Gesund', group: 'Ernährung' },
  { slug: 'vezelrijke-recepten', label: 'Ballaststoffreich', group: 'Ernährung' },
  { slug: 'vegetarische-recepten', label: 'Vegetarisch', group: 'Ernährung' },
];

/** Die Reiter der Katalogansicht, in Anzeigereihenfolge. */
export const CATEGORY_GROUPS = ['Gerichte', 'Küchen', 'Art', 'Ernährung'] as const;

/** Holt die Rezepte einer Kategorie. */
export async function browseCategory(slug: string, limit = 24): Promise<RecipeHit[]> {
  const bekannt = CATEGORIES.some((c) => c.slug === slug);
  if (!bekannt) throw new AllerhandeError(`Unbekannte Kategorie: ${slug}`);

  const html = await getHtml(`/allerhande/recepten/${slug}`);
  return collectHits(html, limit);
}

/** Liest Rezeptlinks aus einer Übersichts- oder Kategorieseite. */
function collectHits(html: string, limit: number): RecipeHit[] {
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
      imageUrl: imageNearLink(html, (m.index ?? 0) + m[0].length),
    });
    if (treffer.length >= limit) break;
  }
  return treffer;
}

/**
 * Sucht das Vorschaubild, das zu einem Rezeptlink gehört.
 *
 * **Bewusst nur vorwärts bis zum schließenden `</a>`.** Die Karte ist ein
 * Link, der das Bild umschließt; alles innerhalb dieses Bereichs gehört
 * sicher zu diesem Rezept. Ein größeres Fenster würde mehr Bilder finden und
 * manche davon dem falschen Gericht zuordnen — und ein falsches Bild ist
 * schlimmer als gar keins, weil man ihm ansieht, dass es nicht passt, aber
 * nicht, welches Rezept dahintersteckt.
 */
function imageNearLink(html: string, von: number): string | undefined {
  const ende = html.indexOf('</a>', von);
  const abschnitt = html.slice(von, ende === -1 ? von + 1200 : ende);
  return firstRecipeImage(abschnitt);
}

/**
 * Zieht die erste Rezeptbild-URL aus einem HTML-Schnipsel.
 *
 * Deckt drei Schreibweisen ab, weil AH sie gemischt verwendet: die nackte
 * URL (`src`, `data-src`, `srcset`) und die Next.js-Bildoptimierung, die die
 * echte URL prozentkodiert in einen `url=`-Parameter packt.
 */
export function firstRecipeImage(html: string): string | undefined {
  const direkt = /https:\/\/static\.ah\.nl\/static\/recepten\/[^"'\s\\)]+/.exec(html);
  if (direkt) return saeubern(direkt[0]);

  const via = /url=(https%3A%2F%2Fstatic\.ah\.nl%2F[^&"'\s]+)/.exec(html);
  if (via) {
    try {
      return saeubern(decodeURIComponent(via[1]));
    } catch {
      /* kaputte Kodierung — dann eben kein Bild */
    }
  }
  return undefined;
}

/** Entfernt, was hinter der Dateiendung noch am Treffer klebt. */
function saeubern(url: string): string {
  return url.replace(/&amp;.*$/, '').replace(/[.,;]+$/, '');
}

/**
 * Liest das Bild aus dem JSON-LD eines Rezepts.
 *
 * `image` ist bei AH meist ein Array, dessen **erster Eintrag ein leerer
 * String** ist — deshalb wird nicht `[0]` genommen, sondern der erste
 * Eintrag mit Inhalt. schema.org erlaubt außerdem ein `ImageObject` statt
 * einer URL; auch das kommt vor.
 */
export function imageFromJsonLd(value: unknown): string | undefined {
  const kandidaten = Array.isArray(value) ? value : [value];
  for (const k of kandidaten) {
    if (typeof k === 'string' && k.trim()) return k.trim();
    if (k && typeof k === 'object') {
      const url = (k as { url?: unknown }).url;
      if (typeof url === 'string' && url.trim()) return url.trim();
    }
  }
  return undefined;
}
