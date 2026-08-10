/**
 * Vergleich: automatische Zuordnung gegen fest gewählte Produkte.
 *
 *   npx tsx scripts/try-recipe.ts
 *
 * Baut dasselbe Rezept zweimal — einmal wie bisher über Suche und
 * Heuristik, einmal mit zwei vom Nutzer fest gewählten Produkten. Zeigt,
 * was die Produktauswahl beim Anlegen tatsächlich bringt.
 */

import { buildShoppingList } from '../src/domain/shoppingList';
import { isPantryStaple, normalizeKey, toDutchSearchTerm } from '../src/domain/translate';
import type { Ingredient, PinnedProduct, Recipe } from '../src/domain/types';
import { formatQuantity, type Unit } from '../src/domain/units';
import { AlbertHeijnProvider } from '../src/supermarkets/albertHeijn';

const ah = new AlbertHeijnProvider();

const ing = (name: string, amount: number, unit: Unit, pinned?: PinnedProduct): Ingredient => ({
  id: normalizeKey(name),
  name,
  searchTermNl: toDutchSearchTerm(name),
  quantity: { amount, unit },
  rawText: `${amount} ${unit} ${name}`,
  isPantryStaple: isPantryStaple(name),
  pinnedProduct: pinned,
});

/** Sucht ein Produkt und merkt es vor — so, wie es der Nutzer im Screen tut. */
async function pick(query: string, match: (title: string) => boolean): Promise<PinnedProduct> {
  const { products } = await ah.searchProducts(query, { size: 25 });
  const hit = products.find((p) => match(p.title.toLowerCase()));
  if (!hit) throw new Error(`Kein Produkt für "${query}" gefunden`);
  return { provider: hit.provider, id: hit.id, title: hit.title, packageSize: hit.packageSize };
}

function makeRecipe(pins: Record<string, PinnedProduct | undefined>): Recipe {
  return {
    id: 'bolo',
    title: 'Spaghetti Bolognese',
    servings: 4,
    ingredients: [
      ing('Spaghetti', 400, 'g'),
      ing('Hackfleisch', 500, 'g', pins.hack),
      ing('Zwiebel', 1, 'Stueck'),
      ing('Knoblauch', 2, 'Zehe'),
      ing('Tomaten', 400, 'g'),
      ing('Tomatenmark', 2, 'EL'),
      ing('Parmesan', 50, 'g', pins.parm),
      ing('Basilikum', 1, 'Bund'),
      ing('Olivenöl', 2, 'EL'),
      ing('Salz', 1, 'Prise'),
      ing('Pfeffer', 1, 'Prise'),
    ],
  };
}

async function show(label: string, recipe: Recipe): Promise<number> {
  const list = await buildShoppingList([recipe], ah);
  console.log(`\n── ${label} ──\n`);
  for (const i of list.items) {
    const price = i.needsManualMatch ? '  fehlt' : `€${i.lineTotal.toFixed(2)}`.padStart(7);
    const bought = i.product
      ? `${i.packagesToBuy} × ${(i.product.packageSize || '?').padEnd(9)} ${i.product.title.slice(0, 32)}`
      : '— nichts gefunden';
    const mark = i.ingredient.pinnedProduct ? '★' : ' ';
    console.log(`  ${mark}${price}  ${formatQuantity(i.requiredQuantity).padEnd(10)} ${i.ingredient.name.padEnd(12)} → ${bought}`);
  }
  console.log(`\n   GESAMT  €${list.total.toFixed(2)}`);
  return list.total;
}

async function main() {
  const before = await show('Automatisch: Suche + Heuristik', makeRecipe({}));

  const pins = {
    hack: await pick('gehakt', (t) => t.includes('gemengd gehakt')),
    parm: await pick('parmigiano reggiano', (t) => !t.includes('biologisch') && !t.includes('flakes')),
  };
  console.log('\n  Fest gewählt (★):');
  console.log(`    ${pins.hack.title} — ${pins.hack.packageSize}`);
  console.log(`    ${pins.parm.title} — ${pins.parm.packageSize}`);

  const after = await show('Mit fest gewählten Produkten', makeRecipe(pins));

  const diff = before - after;
  console.log(
    `\n  Unterschied: €${diff.toFixed(2)} ${diff > 0 ? 'gespart' : 'teurer'}\n`,
  );
}

main();
