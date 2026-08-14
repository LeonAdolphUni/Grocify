/**
 * Rezept-Import von Chefkoch.
 *
 * ⚠️ Chefkoch hat **keine öffentliche API**. Das hier ist das Backend ihrer
 * eigenen App — dieselbe Kategorie wie die Albert-Heijn-Anbindung: es
 * funktioniert, aber es gibt keine Nutzungszusage, und es kann jederzeit
 * dichtgemacht werden. Jumbo hat genau das getan.
 *
 * Der Aufruf läuft bewusst hier im Backend und nicht im Browser. Zwei
 * Gründe: Der Browser käme wegen CORS gar nicht durch, und wenn Chefkoch
 * seine Schnittstelle ändert, ist das eine Datei statt einer neuen
 * App-Version.
 *
 * **Was importiert wird, ist eine bewusste Auswahl:** Titel, Portionen,
 * Zutaten und die Quell-URL. Der Zubereitungstext wird *nicht* übernommen.
 * Zutatenlisten sind in Deutschland in der Regel nicht urheberrechtlich
 * geschützt, Zubereitungstexte schon — und die App braucht sie nicht, um
 * einen Einkauf zu planen. Der Link zum Original bleibt erhalten, damit man
 * zum Kochen dorthin zurückkehren kann.
 */

import { parseAmount, parseUnitWord } from '../src/domain/parseIngredient';
import { isPantryStaple, normalizeKey, toDutchSearchTerm } from '../src/domain/translate';
import type { Ingredient, Recipe } from '../src/domain/types';

const BASE = 'https://api.chefkoch.de/v2';

/** Ohne Browserkennung antwortet die Schnittstelle unzuverlässig. */
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'application/json',
} as const;

/** Was die Suche für die Trefferliste zurückgibt. */
export interface ImportHit {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  /** Bewertung 0…5, wie Chefkoch sie führt. */
  rating?: number;
  ratingCount?: number;
  preparationTime?: number;
  siteUrl?: string;
}

interface CkRecipeSummary {
  id: string;
  title: string;
  subtitle?: string;
  previewImageUrlTemplate?: string;
  rating?: { rating?: number; numVotes?: number };
  preparationTime?: number;
  siteUrl?: string;
}

interface CkIngredient {
  name?: string;
  unit?: string;
  amount?: number | string;
  unitId?: string;
}

interface CkRecipeDetail extends CkRecipeSummary {
  servings?: number;
  ingredientGroups?: { header?: string; ingredients?: CkIngredient[] }[];
}

export class ChefkochError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ChefkochError';
  }
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  } catch (err) {
    throw new ChefkochError(`Chefkoch nicht erreichbar: ${(err as Error).message}`);
  }
  if (!res.ok) {
    throw new ChefkochError(`Chefkoch antwortete mit HTTP ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

/**
 * Chefkochs Pluralklammern entfernen: „Zwiebel(n)" → „Zwiebel".
 *
 * Ohne das findet die Produktsuche nichts. Das Wörterbuch kennt „zwiebel",
 * aber „zwiebel(n)" ist für es ein unbekannter Begriff, und dann geht der
 * deutsche Name unverändert an einen niederländischen Supermarkt.
 *
 * Nur direkt angehängte Endungen fallen weg. Klammern mit Abstand davor
 * („Tomaten (passiert)") tragen echte Information und bleiben stehen.
 */
function cleanName(raw: string): string {
  return raw
    .replace(/(\S)\((?:n|e|en|er|s|se|ne|nen|es|innen)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bildadresse aus Chefkochs Vorlage — `<format>` wird ersetzt. */
function imageUrl(template?: string): string | undefined {
  return template ? template.replace('<format>', 'crop-360x240') : undefined;
}

export async function searchRecipes(query: string, limit = 20): Promise<ImportHit[]> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  const data = await get<{ results?: { recipe: CkRecipeSummary }[] }>(`/recipes?${params}`);

  return (data.results ?? []).map(({ recipe }) => ({
    id: recipe.id,
    title: recipe.title,
    subtitle: recipe.subtitle || undefined,
    imageUrl: imageUrl(recipe.previewImageUrlTemplate),
    rating: recipe.rating?.rating,
    ratingCount: recipe.rating?.numVotes,
    preparationTime: recipe.preparationTime,
    siteUrl: recipe.siteUrl,
  }));
}

/**
 * Holt ein Rezept und übersetzt es in unser Modell.
 *
 * Zutaten ohne Namen fallen heraus — Chefkoch nutzt leere Einträge als
 * Trennzeilen zwischen Gruppen.
 */
export async function importRecipe(chefkochId: string, newRecipeId: string): Promise<Recipe> {
  const detail = await get<CkRecipeDetail>(`/recipes/${encodeURIComponent(chefkochId)}`);

  const ingredients: Ingredient[] = [];

  for (const group of detail.ingredientGroups ?? []) {
    for (const raw of group.ingredients ?? []) {
      const name = cleanName(raw.name ?? '');
      if (!name) continue;

      // Menge 0 heißt bei Chefkoch „nach Geschmack" — Salz, Pfeffer, Muskat.
      // Das ist kein fehlender Wert, sondern die Aussage, dass man das Zeug
      // im Schrank hat. Genau die Zutaten gehören nicht auf die Einkaufsliste.
      const amount = parseAmount(String(raw.amount ?? '')) ?? 0;
      const toTaste = amount <= 0;
      const unit = parseUnitWord(raw.unit) ?? 'Stueck';

      ingredients.push({
        id: normalizeKey(name),
        name,
        searchTermNl: toDutchSearchTerm(name),
        quantity: { amount: toTaste ? 1 : amount, unit },
        // Das Original mitschreiben: Wenn eine Zuordnung später komisch
        // aussieht, sieht man hier, was tatsächlich dastand.
        rawText: [toTaste ? 'nach Geschmack' : raw.amount, raw.unit, name]
          .filter(Boolean)
          .join(' ')
          .trim(),
        isPantryStaple: isPantryStaple(name) || toTaste,
      });
    }
  }

  if (ingredients.length === 0) {
    throw new ChefkochError('Das Rezept enthält keine verwertbaren Zutaten');
  }

  return {
    id: newRecipeId,
    title: detail.title?.trim() || 'Ohne Titel',
    servings: Math.max(1, detail.servings ?? 4),
    ingredients,
    sourceUrl: detail.siteUrl,
    // instructions bleibt bewusst leer — siehe Dateikopf.
  };
}
