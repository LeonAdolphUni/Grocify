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
import { toBase, toBaseForIngredient, type BaseQuantity, type Unit } from './units';

export interface BuildOptions {
  /** Vorratsware (Salz, Öl …) mit auf die Liste nehmen. Standard: nein. */
  includePantryStaples?: boolean;
  /**
   * Wie viele Produktkandidaten je Zutat geprüft werden.
   *
   * Großzügig gewählt: Bei „champignons" stehen auf den ersten acht Plätzen
   * Suppen und Saucen, das eigentliche Produkt erst auf Platz neun. Ein
   * kleines Fenster schneidet den richtigen Treffer ab, und die Kosten sind
   * null — es ist dieselbe eine Anfrage, nur mit größerem `size`.
   */
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
 * Sind zwei Wörter dasselbe Wort, nur in anderer Zahl?
 *
 * „ui" und „uien" ja, „knoflook" und „knoflooksaus" nein. Der Unterschied
 * ist eine kurze Endung gegen ein ganzes zweites Wort — genau daran hängt,
 * ob ein Treffer das gesuchte Produkt ist oder eine Verarbeitung davon.
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const suffix = long.slice(short.length);
  return long.startsWith(short) && ['s', 'e', 'en', 'es'].includes(suffix);
}

/**
 * Wie gut passt der Titel zum Suchbegriff? Kleiner ist besser.
 *
 * 0 = eigenständiges Wort, Singular/Plural zählt mit → „Witte champignons"
 * 1 = Kompositum, das auf den Begriff **endet** → „Kastanjechampignons"
 * 2 = Kompositum, in dem der Begriff sonstwo steckt → „Champignonsoep"
 * 3 = kommt gar nicht vor
 *
 * Die Trennung von 1 und 2 folgt dem niederländischen Wortbau: Das
 * Grundwort steht hinten. „scharrel+eieren" ist eine *Sorte* Eier und damit
 * brauchbar, „champignon+soep" ist eine *Suppe aus* Champignons und damit
 * etwas anderes. Dieselbe Regel trennt „Kastanjechampignons" (Sorte) von
 * „Knoflooksaus" (Verarbeitung).
 */
function matchTier(title: string, searchTerm: string): 0 | 1 | 2 | 3 {
  const titleWords = wordsOf(title);
  const termWords = wordsOf(searchTerm);
  if (termWords.length === 0) return 3;

  if (termWords.every((q) => titleWords.some((t) => sameWord(t, q)))) return 0;
  if (termWords.every((q) => titleWords.some((t) => t.endsWith(q)))) return 1;
  if (termWords.every((q) => titleWords.some((t) => t.includes(q)))) return 2;
  return 3;
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

  // Der Begriff, nach dem am Ende tatsächlich bewertet wird. Kann vom
  // Suchbegriff abweichen, siehe Rückfall aufs Grundwort weiter unten.
  let term = searchTerm;

  if (term) {
    // Erst die Trefferstufe: Ein eigenständiges Wort schlägt jedes
    // Kompositum. Das trennt „Witte champignons" von „Champignonsoep",
    // ohne „Gele uien" gegen „ui" zu benachteiligen — Plural zählt als
    // dasselbe Wort.
    let bestTier = Math.min(...pool.map((p) => matchTier(p.title, term)));

    // Findet kein einziges Produkt den ganzen Begriff, wird auf das
    // Grundwort zurückgefallen — im Niederländischen steht es hinten:
    // „hokkaido pompoen" → „pompoen". Ohne das bliebe die Auswahl
    // *ungefiltert*, und dann gewinnt schlicht das billigste Suchergebnis.
    // Genau so landeten für „hokkaido pompoen" Kürbisbrötchen im Korb.
    const words = wordsOf(term);
    if (bestTier === 3 && words.length > 1) {
      const head = words.at(-1)!;
      const headTier = Math.min(...pool.map((p) => matchTier(p.title, head)));
      if (headTier < 3) {
        term = head;
        bestTier = headTier;
      }
    }

    if (bestTier < 3) {
      const sameTier = pool.filter((p) => matchTier(p.title, term) === bestTier);
      // Dann die Zusatzwörter: „AH Tomaten" schlägt „AH Tomaten gepeld",
      // frisch schlägt Dose. Keine Toleranz — schon ein Wort verschiebt
      // die Bedeutung.
      const minExtra = Math.min(...sameTier.map((p) => extraWordCount(p.title, term)));
      pool = sameTier.filter((p) => extraWordCount(p.title, term) === minExtra);
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
    const tier = term ? matchTier(product.title, term) : 0;

    const better = !best || tier < bestTier || (tier === bestTier && total < best.total);
    if (better) {
      best = { product, packages, total };
      bestTier = tier;
    }
  }

  return best;
}

/**
 * Rechnet aus, wie viel vom Gekauften übrig bleibt.
 *
 * Bedarf 300 g, Gebinde 1 kg, eine Packung gekauft → 30 % verwertet,
 * 700 g übrig. Der Geldwert des Rests ist anteilig geschätzt, nicht exakt:
 * Bei Frischware entspricht das der Realität, bei Gewürzen weniger.
 * Für die Frage „lohnt sich der Wochenplan?" ist die Näherung gut genug.
 */
function computeLeftover(
  required: BaseQuantity | null,
  product: Product,
  packages: number,
  lineTotal: number,
): Pick<ShoppingListItem, 'utilization' | 'leftover' | 'leftoverValue'> {
  const packBase = product.packageQuantity ? toBase(product.packageQuantity) : null;

  // Ohne rechenbaren Bedarf oder Gebinde gibt es nichts zu vergleichen.
  // Dann lieber keine Zahl als eine erfundene.
  if (!required || !packBase || packBase.amount <= 0) return { leftoverValue: 0 };
  if (required.dimension !== packBase.dimension) return { leftoverValue: 0 };

  const bought = packBase.amount * packages;
  if (bought <= 0) return { leftoverValue: 0 };

  const utilization = Math.min(1, required.amount / bought);
  const unit: Unit =
    packBase.dimension === 'mass' ? 'g' : packBase.dimension === 'volume' ? 'ml' : 'Stueck';

  return {
    utilization,
    leftover: { amount: Math.round(Math.max(0, bought - required.amount) * 10) / 10, unit },
    leftoverValue: Math.round(lineTotal * (1 - utilization) * 100) / 100,
  };
}

/**
 * Sucht das passende Produkt für eine einzelne Zutat.
 *
 * Nutzt dieselbe Auswahl wie die Einkaufsliste — was beim Anlegen des
 * Rezepts vorgeschlagen wird, ist damit auch das, was später im Einkauf
 * landet. Zwei getrennte Verfahren würden den Nutzer verwirren, sobald sie
 * einmal auseinanderlaufen.
 */
export async function findProductFor(
  ingredient: Pick<Ingredient, 'id' | 'name' | 'quantity' | 'searchTermNl'>,
  provider: PriceProvider,
): Promise<Product | null> {
  const searchTerm = ingredient.searchTermNl?.trim() || toDutchSearchTerm(ingredient.name);
  const required = toBaseForIngredient(
    ingredient.quantity,
    ingredient.id || normalizeKey(ingredient.name),
  );

  const { products } = await provider.searchProducts(searchTerm, { size: 24 });
  return chooseBestProduct(products, required, searchTerm)?.product ?? null;
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
  const { includePantryStaples = false, candidatesPerIngredient = 24, onProgress } = options;

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
      // Hat der Nutzer beim Anlegen ein Produkt gewählt und passt der
      // Supermarkt, ist jede Suche überflüssig — das ist die zuverlässigste
      // Zuordnung, die es gibt. Nur der Preis wird frisch geholt.
      const pin =
        ing.pinnedProduct && ing.pinnedProduct.provider === provider.id
          ? ing.pinnedProduct
          : undefined;

      let best = null as ReturnType<typeof chooseBestProduct>;
      let pinMissing = false;

      if (pin) {
        const exact = await provider.getProductById(pin.id);
        if (exact) best = chooseBestProduct([exact], required);
        // null heißt ausgelistet — dann unten normal weitersuchen.
        else pinMissing = true;
      }

      if (!best) {
        const { products } = await provider.searchProducts(searchTerm, {
          size: candidatesPerIngredient,
        });
        best = chooseBestProduct(products, required, searchTerm);
      }

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
          leftoverValue: 0,
        };
      } else {
        item = {
          ingredient: ing,
          product: best.product,
          requiredQuantity: ing.quantity,
          packagesToBuy: best.packages,
          lineTotal: best.total,
          ...computeLeftover(required, best.product, best.packages, best.total),
          needsManualMatch: false,
          note: pinMissing
            ? `Dein gewähltes Produkt „${pin?.title}" gibt es nicht mehr — Ersatz automatisch gesucht`
            : required
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
        leftoverValue: 0,
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
