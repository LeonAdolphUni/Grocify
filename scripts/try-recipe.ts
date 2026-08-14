/**
 * Baut die Einkaufsliste für ein einzelnes Testrezept.
 *
 *   npx tsx scripts/try-recipe.ts
 *
 * Die Rezepte liegen in `fixtures.ts` und sind bewusst kein Teil der App —
 * die startet leer mit deinen eigenen Daten. Als feste Vorlage für
 * Messungen werden sie aber gebraucht: Ohne sie ließe sich nicht
 * vergleichen, ob eine Änderung an der Produktzuordnung die Liste besser
 * oder schlechter macht.
 */

import { buildShoppingList } from '../src/domain/shoppingList';
import { formatQuantity } from '../src/domain/units';
import { AlbertHeijnProvider } from '../src/supermarkets/albertHeijn';
import { TEST_RECIPE } from './fixtures';

async function main() {
  const ah = new AlbertHeijnProvider();

  console.log(
    `\n  ${TEST_RECIPE.title} — ${TEST_RECIPE.servings} Portionen, ${TEST_RECIPE.ingredients.length} Zutaten\n`,
  );

  const list = await buildShoppingList([TEST_RECIPE], ah, {
    onProgress: (d, t, l) => process.stdout.write(`\r  ${d}/${t} ${l.padEnd(20)}`),
  });
  process.stdout.write('\r' + ' '.repeat(40) + '\r');

  for (const i of list.items) {
    const price = i.needsManualMatch ? '  fehlt' : `€${i.lineTotal.toFixed(2)}`.padStart(7);
    const bought = i.product
      ? `${i.packagesToBuy} × ${(i.product.packageSize || '?').padEnd(9)} ${i.product.title.slice(0, 32)}`
      : '— nichts gefunden';
    console.log(
      `  ${price}  ${formatQuantity(i.requiredQuantity).padEnd(11)} ${i.ingredient.name.padEnd(13)} → ${bought}`,
    );
    if (i.note) console.log(`           ↳ ${i.note}`);
  }

  const dropped = TEST_RECIPE.ingredients.length - list.items.length;
  console.log(`\n  GESAMT  €${list.total.toFixed(2)}`);
  console.log(`  ${dropped} Zutaten als Vorrat aussortiert\n`);
}

main();
