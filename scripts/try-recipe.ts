/**
 * Baut die Einkaufsliste für das Beispielrezept der App.
 *
 *   npx tsx scripts/try-recipe.ts
 *
 * Nutzt bewusst `createDemoRecipe` — dieselbe Quelle wie der Knopf
 * „Beispielrezept laden" in der App. Was hier steht, ist das, was der
 * Nutzer auf dem Bildschirm sieht. Ein Testskript mit eigener Rezeptkopie
 * beweist nur, dass das Testskript funktioniert.
 */

import { createDemoRecipe } from '../src/domain/demoRecipe';
import { buildShoppingList } from '../src/domain/shoppingList';
import { formatQuantity } from '../src/domain/units';
import { AlbertHeijnProvider } from '../src/supermarkets/albertHeijn';

async function main() {
  const recipe = createDemoRecipe('demo');
  const ah = new AlbertHeijnProvider();

  console.log(`\n  ${recipe.title} — ${recipe.servings} Portionen, ${recipe.ingredients.length} Zutaten\n`);

  const list = await buildShoppingList([recipe], ah, {
    onProgress: (d, t, l) => process.stdout.write(`\r  ${d}/${t} ${l.padEnd(20)}`),
  });
  process.stdout.write('\r' + ' '.repeat(40) + '\r');

  for (const i of list.items) {
    const price = i.needsManualMatch ? '  fehlt' : `€${i.lineTotal.toFixed(2)}`.padStart(7);
    const bought = i.product
      ? `${i.packagesToBuy} × ${(i.product.packageSize || '?').padEnd(9)} ${i.product.title.slice(0, 32)}`
      : '— nichts gefunden';
    console.log(`  ${price}  ${formatQuantity(i.requiredQuantity).padEnd(11)} ${i.ingredient.name.padEnd(13)} → ${bought}`);
    if (i.note) console.log(`           ↳ ${i.note}`);
  }

  const dropped = recipe.ingredients.length - list.items.length;
  console.log(`\n  GESAMT  €${list.total.toFixed(2)}`);
  console.log(`  ${dropped} Zutaten als Vorrat aussortiert\n`);
}

main();
