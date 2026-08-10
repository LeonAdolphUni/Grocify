/**
 * Aus Rezepten wird eine Einkaufsliste.
 *
 * Der interessante Teil ist nicht das Suchen, sondern die Frage "wie viele
 * Packungen brauche ich davon" — und welche Packungsgröße dafür am
 * günstigsten ist.
 */

import type { PriceProvider } from '../supermarkets/types';
import { isPantryStaple, normalizeKey, toDutchSearchTerm } from './translate';
import type { Ingredient, Product, Recipe, ShoppingList, ShoppingListItem } from './types';
import { calculateTotal, packagesNeeded } from './types';
import { toBase, toBaseForIngredient } from './units';

export interface BuildOptions {
  /** Vorratsware (Salz, Öl …) mit auf die Liste nehmen. Standard: nein. */
  includePantryStaples?: boolean;
  /** Wie viele Produktkandidaten je Zutat geprüft werden. */
  candidatesPerIngredient?: number;
  /** Fortschrittsmeldung für die UI. */
  onProgress?: (done: number, total: number, currentLabel: string) => void;
}

/**
 * Fasst gleiche Zutaten aus mehreren Rezepten zusammen.
 *
 * Zusammengefasst wird nur, was dieselbe Basisdimension hat: 100 g + 200 g
 * ergibt 300 g, aber "2 Zehen" und "50 g" Knoblauch bleiben zwei Zeilen —
 * sonst entstünden stillschweigend falsche Mengen.
 */
export function mergeIngredients(recipes: Recipe[]): Ingredient[] {
  const groups = new Map<string, Ingredient>();

  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      const base = toBaseForIngredient(ing.quantity, ing.id || normalizeKey(ing.name));
      const groupKey = `${normalizeKey(ing.name)}|${base?.dimension ?? ing.quantity.unit}`;
      const existing = groups.get(groupKey);

      if (!existing) {
        groups.set(groupKey, { ...ing });
        continue;
      }

      // Gleiche Einheit: direkt addieren. Sonst über die Basiseinheit gehen.
      if (existing.quantity.unit === ing.quantity.unit) {
        existing.quantity = {
          ...existing.quantity,
          amount: existing.quantity.amount + ing.quantity.amount,
        };
      } else {
        const a = toBaseForIngredient(existing.quantity, existing.id || normalizeKey(existing.name));
        const b = base;
        if (a && b && a.dimension === b.dimension) {
          existing.quantity = {
            amount: a.amount + b.amount,
            unit: a.dimension === 'mass' ? 'g' : a.dimension === 'volume' ? 'ml' : 'Stueck',
          };
        }
      }
    }
  }

  return [...groups.values()];
}

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,./()\-–—]+/)
    .filter(Boolean);
}

/**
 * Wie gut passt der Titel zum Suchbegriff? Kleiner ist besser.
 *
 * 0 = alle Suchwörter stehen als **eigenständige Wörter** im Titel
 * 1 = sie stecken nur in zusammengesetzten Wörtern
 * 2 = kommen gar nicht vor
 *
 * Die Unterscheidung zwischen 0 und 1 ist im Niederländischen entscheidend.
 * Komposita sind dort die Regel, und eine reine Teilzeichenketten-Prüfung
 * hält „Knoflooksaus" (Knoblauchsauce) für einen perfekten Treffer auf
 * „knoflook" — dieselbe Falle liefert „Tomatenketchup" für „tomaten".
 */
function matchTier(title: string, searchTerm: string): 0 | 1 | 2 {
  const titleWords = wordsOf(title);
  const termWords = wordsOf(searchTerm);
  if (termWords.length === 0) return 2;

  if (termWords.every((q) => titleWords.includes(q))) return 0;
  if (termWords.every((q) => titleWords.some((t) => t.includes(q)))) return 1;
  return 2;
}

/**
 * Zählt Wörter im Produkttitel, die weder Marke noch Suchbegriff sind.
 *
 * „AH Tomaten" hat null Zusatzwörter, „AH Tomaten passata gezeefd" hat zwei.
 * Je weniger Zusatz, desto eher ist es das schlichte Grundprodukt und nicht
 * eine Verarbeitungsform davon.
 */
function extraWordCount(title: string, searchTerm: string): number {
  const termWords = wordsOf(searchTerm);
  return wordsOf(title).filter(
    (w) =>
      w !== 'ah' && // Eigenmarke, trägt keine Bedeutung
      // Wörter, die einen Suchbegriff enthalten, zählen nicht als Zusatz:
      // „uien" ist der Plural von „ui", „scharreleieren" eine Eiersorte.
      !termWords.some((q) => w.includes(q) || q.includes(w)),
  ).length;
}

/**
 * Wählt das Produkt, das den Bedarf deckt.
 *
 * Zwei Kriterien, in dieser Reihenfolge:
 *
 * 1. **Passt es inhaltlich?** Rein auf den Preis zu optimieren führt in die
 *    Irre: Für „eieren" liefert die Suche flüssiges Eiweiß und Erdbeeren,
 *    für „tomaten" Ketchup und Passata — alles billiger als das gemeinte
 *    Produkt. Deshalb zuerst nach Titelübereinstimmung filtern und
 *    Zusatzwörter zählen. AHs eigene Trefferreihenfolge taugt dafür nicht,
 *    die setzt Ketchup auf Platz 2 von „tomaten".
 *
 * 2. **Was kostet am wenigsten?** Erst innerhalb der passenden Produkte
 *    entscheidet der Gesamtpreis — und zwar der für ganze Packungen. Für
 *    200 g Mehl ist die 500-g-Packung für 0,55 € besser als die
 *    1-kg-Packung für 0,85 €, obwohl deren Kilopreis identisch ist.
 *
 * Das bleibt eine Heuristik. Die belastbare Lösung ist die semantische
 * Zuordnung über die Claude API in Sprint 6/7 — Mengenangaben wie „3 Eier"
 * gegen „3-pack à 10 Stück" bekommt keine Wortzählung sauber hin.
 */
export function chooseBestProduct(
  candidates: Product[],
  required: { amount: number; dimension: string } | null,
  searchTerm = '',
): { product: Product; packages: number; total: number } | null {
  if (candidates.length === 0) return null;

  const available = candidates.filter((p) => p.isAvailable && p.price > 0);
  let pool = available.length > 0 ? available : candidates;

  if (searchTerm) {
    // Nur Produkte, die den Suchbegriff überhaupt tragen.
    const relevant = pool.filter((p) => matchTier(p.title, searchTerm) < 2);
    if (relevant.length > 0) {
      // Zusatzwörter zuerst: „Gele uien" (1 Zusatz) schlägt
      // „Pie runderstoof ui 2-pack" (4 Zusätze). Keine Toleranz — schon ein
      // Wort verschiebt die Bedeutung ("Tomaten" vs. "Tomaten gepeld").
      const minExtra = Math.min(...relevant.map((p) => extraWordCount(p.title, searchTerm)));
      pool = relevant.filter((p) => extraWordCount(p.title, searchTerm) === minExtra);
    }
  }

  const score = (product: Product) => {
    let packages = 1;
    if (required && product.packageQuantity) {
      const packBase = toBase(product.packageQuantity);
      const needed = packBase ? packagesNeeded(required, packBase) : null;
      // null heißt: Dimensionen passen nicht zusammen (z. B. Bedarf in ml,
      // Gebinde in Stück). Dann ist eine Packung die ehrlichste Annahme.
      packages = needed ?? 1;
    }
    return { packages, total: Math.round(packages * product.price * 100) / 100 };
  };

  let best: { product: Product; packages: number; total: number } | null = null;
  let bestTier = 3;

  for (const product of pool) {
    const { packages, total } = score(product);
    // Stichentscheid bei gleich vielen Zusatzwörtern: das eigenständige Wort
    // gewinnt gegen das Kompositum — „Knoflook" statt „Knoflooksaus".
    const tier = searchTerm ? matchTier(product.title, searchTerm) : 0;

    const better = !best || tier < bestTier || (tier === bestTier && total < best.total);
    if (better) {
      best = { product, packages, total };
      bestTier = tier;
    }
  }

  return best;
}

/** Führt asynchrone Aufgaben mit begrenzter Parallelität aus. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

export async function buildShoppingList(
  recipes: Recipe[],
  provider: PriceProvider,
  options: BuildOptions = {},
): Promise<ShoppingList> {
  const { includePantryStaples = false, candidatesPerIngredient = 6, onProgress } = options;

  const merged = mergeIngredients(recipes).filter(
    (ing) => includePantryStaples || !(ing.isPantryStaple || isPantryStaple(ing.name)),
  );

  let done = 0;
  // Drei parallele Anfragen: schnell genug für ein Rezept, ohne die
  // Datenquelle mit einem Schwall gleichzeitiger Requests zu treffen.
  const items = await mapLimit(merged, 3, async (ing): Promise<ShoppingListItem> => {
    const searchTerm = ing.searchTermNl?.trim() || toDutchSearchTerm(ing.name);
    const required = toBaseForIngredient(ing.quantity, ing.id || normalizeKey(ing.name));

    let item: ShoppingListItem;
    try {
      const { products } = await provider.searchProducts(searchTerm, {
        size: candidatesPerIngredient,
      });
      const best = chooseBestProduct(products, required, searchTerm);

      if (!best) {
        item = {
          ingredient: ing,
          product: null,
          requiredQuantity: ing.quantity,
          packagesToBuy: 0,
          lineTotal: 0,
          needsManualMatch: true,
          note: `Kein Produkt für „${searchTerm}" gefunden`,
          checked: false,
        };
      } else {
        item = {
          ingredient: ing,
          product: best.product,
          requiredQuantity: ing.quantity,
          packagesToBuy: best.packages,
          lineTotal: best.total,
          needsManualMatch: false,
          note: required
            ? undefined
            : `Menge „${ing.quantity.unit}" ist ohne Zutatenwissen nicht umrechenbar — eine Packung angenommen`,
          checked: false,
        };
      }
    } catch (err) {
      item = {
        ingredient: ing,
        product: null,
        requiredQuantity: ing.quantity,
        packagesToBuy: 0,
        lineTotal: 0,
        needsManualMatch: true,
        note: `Suche fehlgeschlagen: ${(err as Error).message}`,
        checked: false,
      };
    }

    done++;
    onProgress?.(done, merged.length, ing.name);
    return item;
  });

  return {
    id: `list-${Date.now().toString(36)}`,
    recipes,
    items,
    provider: provider.id,
    total: calculateTotal(items),
    createdAt: new Date().toISOString(),
  };
}
