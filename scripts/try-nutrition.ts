/**
 * Nährwerte eines echten Rezepts durchrechnen.
 *
 *   npm run try:nutrition            # das erste Rezept aus der Datenbank
 *   npm run try:nutrition -- 2       # das zweite
 *
 * Zeigt bewusst auch, was fehlt: Eine Kalorienangabe ohne die Angabe,
 * worauf sie beruht, ist eine Behauptung.
 */

import { GrocifyDb } from '../server/db';
import { coverageLabel, isTrustworthy, nutritionForRecipe } from '../src/domain/nutrition';
import { AlbertHeijnProvider } from '../src/supermarkets/albertHeijn';

async function main() {
  const db = new GrocifyDb('server/data/grocify.db');
  const rezepte = db.listRecipes();
  db.close();

  if (rezepte.length === 0) {
    console.log('\n  Keine Rezepte in der Datenbank.\n');
    return;
  }

  const index = Math.max(1, Number(process.argv[2]) || 1) - 1;
  const rezept = rezepte[Math.min(index, rezepte.length - 1)];

  console.log(`\n── ${rezept.title} · ${rezept.servings} Portionen ──\n`);

  const n = await nutritionForRecipe(rezept, new AlbertHeijnProvider());
  const p = n.perServing;

  console.log(`  Je Portion:`);
  console.log(`    ${p.kcal ?? '—'} kcal`);
  console.log(`    Fett ${p.fat ?? '—'} g  (davon gesättigt ${p.saturatedFat ?? '—'} g)`);
  console.log(`    Kohlenhydrate ${p.carbs ?? '—'} g  (davon Zucker ${p.sugar ?? '—'} g)`);
  console.log(`    Eiweiß ${p.protein ?? '—'} g · Salz ${p.salt ?? '—'} g`);
  console.log(`\n  Gesamt: ${n.total.kcal ?? '—'} kcal`);
  console.log(`  Grundlage: ${coverageLabel(n)}${isTrustworthy(n) ? '' : '  ← zu wenig, wird nicht angezeigt'}`);

  if (n.missing.length > 0) {
    console.log(`\n  Nicht eingerechnet:`);
    for (const m of n.missing) console.log(`    ${m.name.padEnd(24)} ${m.reason}`);
  }
  console.log();
}

void main();
