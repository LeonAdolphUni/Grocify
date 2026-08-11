/**
 * Misst den Beispiel-Wochenplan gegen echte Albert-Heijn-Preise.
 *
 *   npm run try:week
 *
 * Vergleicht zwei Einkäufe für dieselben sieben Gerichte:
 *   a) sieben getrennte Einkäufe, einer je Abend
 *   b) ein gemeinsamer Wocheneinkauf
 *
 * Der Unterschied ist der eigentliche Nutzen der App. Wenn er klein
 * ausfällt, taugt der Plan nichts und gehört überarbeitet — deshalb wird
 * hier gemessen statt behauptet.
 */

import { createDemoRecipes } from '../src/domain/demoRecipe';
import { suggestRecipesForLeftovers } from '../src/domain/leftoverUse';
import { buildShoppingList } from '../src/domain/shoppingList';
import { calculateStats } from '../src/domain/types';
import { formatQuantity } from '../src/domain/units';
import { AlbertHeijnProvider } from '../src/supermarkets/albertHeijn';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} %`);

async function main() {
  const ah = new AlbertHeijnProvider();
  const recipes = createDemoRecipes();

  // a) Jeder Abend für sich eingekauft
  let separateTotal = 0;
  let separateLeftover = 0;
  for (const r of recipes) {
    const list = await buildShoppingList([r], ah);
    separateTotal += list.total;
    separateLeftover += calculateStats(list).leftoverValue;
  }

  // b) Die Woche gemeinsam
  const week = await buildShoppingList(recipes, ah);
  const stats = calculateStats(week);

  console.log('\n╭─ Wocheneinkauf ────────────────────────────────────────────\n');
  for (const i of week.items) {
    const price = i.needsManualMatch ? '  fehlt' : `€${i.lineTotal.toFixed(2)}`.padStart(7);
    const util = i.utilization !== undefined ? `${String(Math.round(i.utilization * 100)).padStart(3)} %` : '   —';
    const rest = i.leftover && i.leftover.amount > 0 ? `Rest ${formatQuantity(i.leftover)}` : '';
    console.log(
      `  ${price} ${util}  ${formatQuantity(i.requiredQuantity).padEnd(11)} ${i.ingredient.name.padEnd(14)} ` +
        `${i.packagesToBuy} × ${(i.product?.packageSize || '?').padEnd(9)} ${rest}`,
    );
  }

  console.log('\n╰────────────────────────────────────────────────────────────');
  console.log(`\n  Sieben getrennte Einkäufe   €${separateTotal.toFixed(2)}   (Reste €${separateLeftover.toFixed(2)})`);
  console.log(`  Ein Wocheneinkauf           €${week.total.toFixed(2)}   (Reste €${stats.leftoverValue.toFixed(2)})`);
  console.log(`  ────────────────────────────────────────`);
  console.log(`  Ersparnis                   €${(separateTotal - week.total).toFixed(2)}`);
  console.log(`\n  Verwertung   ${pct(stats.utilization)}`);
  console.log(`  Portionen    ${stats.servings}  →  €${stats.pricePerServing?.toFixed(2)} je Portion`);
  console.log(`  Positionen   ${stats.matched} zugeordnet, ${stats.unmatched} offen, ${stats.packages} Packungen`);
  if (stats.mostExpensive) {
    console.log(`  Teuerste     ${stats.mostExpensive.product?.title} — €${stats.mostExpensive.lineTotal.toFixed(2)}`);
  }

  // Restverwertung: Fünf Tage geplant, zwei Rezepte übrig — schlägt die App
  // die richtigen vor, um die Reste aufzubrauchen?
  console.log('\n── Restverwertung (nur 5 von 7 Tagen geplant) ──');
  const partial = await buildShoppingList(recipes.slice(0, 5), ah);
  const partialStats = calculateStats(partial);
  console.log(`  Teilwoche: €${partial.total.toFixed(2)}, Verwertung ${pct(partialStats.utilization)}, Reste €${partialStats.leftoverValue.toFixed(2)}`);
  const suggestions = suggestRecipesForLeftovers(partial, recipes);
  if (suggestions.length === 0) {
    console.log('  Keine Vorschläge — verdächtig, die Reste müssten zu etwas passen.');
  } else {
    for (const sug of suggestions) {
      console.log(`  €${sug.value.toFixed(2)}  ${sug.recipe.title.padEnd(26)} verwertet: ` +
        sug.uses.map((u) => `${u.ingredientName} ${Math.round(u.share * 100)} %`).join(', '));
    }
  }

  const worst = week.items
    .filter((i) => i.utilization !== undefined && i.utilization < 0.6)
    .sort((a, b) => (a.utilization ?? 1) - (b.utilization ?? 1));
  if (worst.length > 0) {
    console.log('\n  Schlecht verwertet (unter 60 %):');
    for (const i of worst) {
      console.log(
        `    ${String(Math.round((i.utilization ?? 0) * 100)).padStart(3)} %  ${i.ingredient.name.padEnd(14)} ` +
          `Rest ${i.leftover ? formatQuantity(i.leftover) : '?'}  (€${i.leftoverValue.toFixed(2)})`,
      );
    }
  }
  console.log('');
}

main();
