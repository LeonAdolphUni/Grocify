/**
 * Smoke-Test der Einkaufslisten-Logik.
 *
 * Baut aus einem Beispielrezept eine vollständige Liste gegen echte
 * Albert-Heijn-Daten: `npm run smoke:list`
 *
 * Prüft die Kette Zusammenfassen → DE→NL-Übersetzung → Produktsuche →
 * günstigste Packungskombination → Summe.
 */

import { buildShoppingList } from '../src/domain/shoppingList';
import type { Ingredient, Recipe } from '../src/domain/types';
import { normalizeKey, toDutchSearchTerm } from '../src/domain/translate';
import { formatQuantity, type Unit } from '../src/domain/units';
import { AlbertHeijnProvider } from '../src/supermarkets/albertHeijn';

const ing = (name: string, amount: number, unit: Unit): Ingredient => ({
  id: normalizeKey(name),
  name,
  searchTermNl: toDutchSearchTerm(name),
  quantity: { amount, unit },
  rawText: `${amount} ${unit} ${name}`,
  isPantryStaple: false,
});

const pancakes: Recipe = {
  id: 'demo-1',
  title: 'Pfannkuchen',
  servings: 4,
  ingredients: [
    ing('Weizenmehl', 250, 'g'),
    ing('Milch', 500, 'ml'),
    ing('Eier', 3, 'Stueck'),
    ing('Butter', 50, 'g'),
    ing('Salz', 1, 'Prise'), // Vorratsware — muss herausfallen
  ],
};

const salad: Recipe = {
  id: 'demo-2',
  title: 'Tomatensalat',
  servings: 4,
  ingredients: [
    ing('Tomaten', 500, 'g'),
    ing('Zwiebel', 1, 'Stueck'),
    ing('Olivenöl', 3, 'EL'), // Vorratsware
    ing('Weizenmehl', 50, 'g'), // absichtlich doppelt: muss mit Rezept 1 verschmelzen
  ],
};

async function main() {
  const ah = new AlbertHeijnProvider();
  console.log('\n╭─ Einkaufsliste aus 2 Rezepten ─────────────────────────────\n');

  const list = await buildShoppingList([pancakes, salad], ah, {
    onProgress: (done, total, label) =>
      process.stdout.write(`\r  ${done}/${total} — ${label.padEnd(24)}`),
  });
  process.stdout.write('\r' + ' '.repeat(48) + '\r');

  for (const item of list.items) {
    const bought = item.product
      ? `${item.packagesToBuy} × ${item.product.packageSize.padEnd(7)} ${item.product.title.slice(0, 30)}`
      : '— kein Produkt gefunden';
    const price = item.needsManualMatch ? '  fehlt' : `€${item.lineTotal.toFixed(2)}`.padStart(7);

    console.log(`  ${price}  ${formatQuantity(item.requiredQuantity).padEnd(12)} ${item.ingredient.name.padEnd(12)} → ${bought}`);
    if (item.note) console.log(`           ↳ ${item.note}`);
  }

  console.log(`\n  ${'GESAMT'.padEnd(14)} €${list.total.toFixed(2)}`);
  console.log('\n╰────────────────────────────────────────────────────────────\n');

  // Erwartungen prüfen
  let failures = 0;
  const check = (label: string, ok: boolean) => {
    if (!ok) failures++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  };

  const names = list.items.map((i) => i.ingredient.name);
  check('Vorratsware (Salz, Olivenöl) fehlt auf der Liste',
    !names.includes('Salz') && !names.includes('Olivenöl'));
  check('Weizenmehl aus beiden Rezepten zu einer Zeile verschmolzen',
    names.filter((n) => n === 'Weizenmehl').length === 1);
  const mehl = list.items.find((i) => i.ingredient.name === 'Weizenmehl');
  check('Verschmolzene Menge ist 300 g (250 + 50)',
    mehl?.requiredQuantity.amount === 300);
  check('Mindestens ein Produkt zugeordnet', list.items.some((i) => i.product !== null));
  check('Gesamtpreis > 0', list.total > 0);

  console.log(failures === 0 ? '\n✓ Einkaufslisten-Logik arbeitet korrekt.\n' : `\n✗ ${failures} Problem(e).\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
