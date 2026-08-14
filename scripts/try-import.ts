/**
 * Probelauf für den Chefkoch-Import.
 *
 * Prüft die ganze Kette an einem echten Rezept: suchen → importieren →
 * Zutaten übersetzen → Produkte bei Albert Heijn finden → Preis rechnen.
 * Genau hier zeigt sich, ob ein Import brauchbar ist: Ein Rezept, dessen
 * Zutaten kein Produkt finden, ist im Buch wertlos — und das sieht man
 * erst, wenn man bis zum Preis durchrechnet.
 *
 *   npm run try:import               — Standardsuche
 *   npm run try:import -- lasagne    — eigener Suchbegriff
 *
 * Läuft ohne Backend: Der Import wird hier direkt aufgerufen, nichts wird
 * gespeichert.
 */

import { importRecipe, searchRecipes } from '../server/chefkoch';
import { newId } from '../src/domain/id';
import { buildShoppingList } from '../src/domain/shoppingList';
import { euro } from '../src/ui/theme';
import { AlbertHeijnProvider } from '../src/supermarkets/albertHeijn';

const pct = (v: number | undefined) => (v === undefined ? '  —  ' : `${Math.round(v * 100)}%`.padStart(5));

async function main() {
  const query = process.argv.slice(2).join(' ') || 'kürbissuppe';

  console.log(`\nSuche bei Chefkoch nach „${query}" …\n`);
  const hits = await searchRecipes(query, 5);

  if (hits.length === 0) {
    console.log('  keine Treffer\n');
    return;
  }

  for (const hit of hits) {
    console.log(`  ${hit.title.slice(0, 46).padEnd(48)} ★ ${(hit.rating ?? 0).toFixed(2)}`);
  }

  const recipe = await importRecipe(hits[0].id, newId());

  console.log(`\n── ${recipe.title} · ${recipe.servings} Portionen ──\n`);
  for (const ing of recipe.ingredients) {
    console.log(
      `  ${ing.rawText.slice(0, 32).padEnd(34)} → ${(ing.searchTermNl ?? '?').padEnd(20)}` +
        `${ing.isPantryStaple ? ' (Vorrat, nicht auf der Liste)' : ''}`,
    );
  }

  console.log('\nEinkaufsliste bei Albert Heijn …\n');
  const list = await buildShoppingList([recipe], new AlbertHeijnProvider());

  for (const item of list.items) {
    const p = item.product;
    console.log(
      `  ${item.ingredient.name.slice(0, 16).padEnd(18)}` +
        (p
          ? `${p.title.slice(0, 38).padEnd(40)} ${item.packagesToBuy}× ` +
            `${euro(item.lineTotal).padStart(8)}  ${pct(item.utilization)} genutzt`
          : 'KEIN PRODUKT GEFUNDEN'),
    );
  }

  const missing = list.items.filter((i) => i.needsManualMatch).length;
  console.log(`\n  Gesamt ${euro(list.total)} · ${list.items.length} Positionen`);
  if (missing > 0) {
    console.log(`  ${missing} ohne Treffer — die muss man von Hand zuordnen`);
  }
  console.log();
}

void main();
