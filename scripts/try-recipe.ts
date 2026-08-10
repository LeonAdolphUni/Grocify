/** Einmal-Test: Beispielrezept durch die Einkaufslisten-Logik jagen. */

import { buildShoppingList } from '../src/domain/shoppingList';
import { normalizeKey, toDutchSearchTerm } from '../src/domain/translate';
import type { Ingredient, Recipe } from '../src/domain/types';
import { formatQuantity, type Unit } from '../src/domain/units';
import { isPantryStaple } from '../src/domain/translate';
import { AlbertHeijnProvider } from '../src/supermarkets/albertHeijn';

const ing = (name: string, amount: number, unit: Unit): Ingredient => ({
  id: normalizeKey(name),
  name,
  searchTermNl: toDutchSearchTerm(name),
  quantity: { amount, unit },
  rawText: `${amount} ${unit} ${name}`,
  isPantryStaple: isPantryStaple(name),
});

const recipe: Recipe = {
  id: 'bolo',
  title: 'Spaghetti Bolognese',
  servings: 4,
  ingredients: [
    ing('Spaghetti', 400, 'g'),
    ing('Hackfleisch', 500, 'g'),
    ing('Zwiebel', 1, 'Stueck'),
    ing('Knoblauch', 2, 'Zehe'),
    ing('Tomaten', 400, 'g'),
    ing('Tomatenmark', 2, 'EL'),
    ing('Parmesan', 50, 'g'),
    ing('Basilikum', 1, 'Bund'),
    ing('Olivenöl', 2, 'EL'),
    ing('Salz', 1, 'Prise'),
    ing('Pfeffer', 1, 'Prise'),
  ],
};

async function main() {
  const list = await buildShoppingList([recipe], new AlbertHeijnProvider(), {
    onProgress: (d, t, l) => process.stdout.write(`\r  ${d}/${t} ${l.padEnd(20)}`),
  });
  process.stdout.write('\r' + ' '.repeat(40) + '\r');

  console.log(`\n  ${recipe.title} — ${recipe.servings} Portionen\n`);
  for (const i of list.items) {
    const price = i.needsManualMatch ? '  fehlt' : `€${i.lineTotal.toFixed(2)}`.padStart(7);
    const bought = i.product
      ? `${i.packagesToBuy} × ${(i.product.packageSize || '?').padEnd(8)} ${i.product.title.slice(0, 34)}`
      : `— nichts gefunden für "${i.ingredient.searchTermNl}"`;
    console.log(`  ${price}  ${formatQuantity(i.requiredQuantity).padEnd(11)} ${i.ingredient.name.padEnd(13)} → ${bought}`);
    if (i.note) console.log(`           ↳ ${i.note}`);
    if (i.product?.category) console.log(`           Abteilung: ${i.product.category}`);
  }
  console.log(`\n  GESAMT  €${list.total.toFixed(2)}`);
  const dropped = recipe.ingredients.length - list.items.length;
  console.log(`  (${dropped} Zutaten als Vorrat aussortiert)\n`);
}

main();
