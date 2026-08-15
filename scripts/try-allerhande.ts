/**
 * Probelauf für den Allerhande-Import.
 *
 *   npm run try:allerhande            — Standardsuche
 *   npm run try:allerhande -- pasta   — eigener Begriff
 *
 * Prüft die ganze Kette: suchen → importieren → Produkte bei AH finden →
 * Preis rechnen. Der entscheidende Wert ist die Trefferquote: Bei AH-eigenen
 * Rezepten sollte sie nahe hundert Prozent liegen, weil die Zutatennamen
 * bereits AHs Produktnamen sind.
 */

import { importRecipe, searchRecipes } from '../server/allerhande';
import { newId } from '../src/domain/id';
import { buildShoppingList } from '../src/domain/shoppingList';
import { AlbertHeijnProvider } from '../src/supermarkets/albertHeijn';
import { euro } from '../src/ui/theme';

async function main() {
  const query = process.argv.slice(2).join(' ') || 'pasta';
  console.log(`\nSuche bei Allerhande nach „${query}" …\n`);

  const hits = await searchRecipes(query, 6);
  for (const h of hits) console.log(`  ${h.title.slice(0, 52).padEnd(54)} ${h.id}`);
  if (hits.length === 0) return console.log('  keine Treffer\n');

  const { recipe, nutrition, totalMinutes, diets } = await importRecipe(hits[0].path, newId());

  console.log(`\n── ${recipe.title} · ${recipe.servings} Portionen`
    + `${totalMinutes ? ` · ${totalMinutes} Min` : ''}${diets.length ? ` · ${diets.join(', ')}` : ''} ──\n`);
  for (const i of recipe.ingredients) {
    console.log(`  ${i.rawText.slice(0, 40).padEnd(42)} → ${i.name.slice(0, 28).padEnd(30)}${i.isPantryStaple ? ' (Vorrat)' : ''}`);
  }
  if (nutrition?.kcal) {
    console.log(`\n  AHs Nährwerte je Portion: ${nutrition.kcal} kcal · Fett ${nutrition.fat ?? '—'} g · KH ${nutrition.carbs ?? '—'} g · Eiweiß ${nutrition.protein ?? '—'} g`);
  }

  console.log('\nEinkaufsliste …\n');
  const list = await buildShoppingList([recipe], new AlbertHeijnProvider());
  for (const item of list.items) {
    const p = item.product;
    console.log(`  ${item.ingredient.name.slice(0, 26).padEnd(28)}` +
      (p ? `${p.title.slice(0, 34).padEnd(36)} ${euro(item.lineTotal).padStart(8)}` : 'KEIN PRODUKT'));
  }
  const offen = list.items.filter((i) => i.needsManualMatch).length;
  const quote = list.items.length ? Math.round(((list.items.length - offen) / list.items.length) * 100) : 0;
  console.log(`\n  Gesamt ${euro(list.total)} · ${list.items.length} Positionen · ${quote} % zugeordnet${offen ? `, ${offen} offen` : ''}\n`);
}

void main();
