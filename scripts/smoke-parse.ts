/**
 * Prüft den Zutaten-Parser gegen die Schreibweisen, die Menschen wirklich tippen.
 *
 *   npm run smoke:parse
 *
 * Reine Logik, kein Netzwerk — läuft in Millisekunden.
 */

import { parseIngredientInput } from '../src/domain/parseIngredient';

type Case = [input: string, expected: string];

const CASES: Case[] = [
  // Menge hinten, zusammengeschrieben — die Schreibweise aus der Anforderung
  ['milch 0,5l', 'milch · 0.5 l'],
  ['Mehl 300g', 'Mehl · 300 g'],
  ['Hackfleisch 500 g', 'Hackfleisch · 500 g'],

  // Menge vorne
  ['500g Hackfleisch', 'Hackfleisch · 500 g'],
  ['0,5 l Milch', 'Milch · 0.5 l'],
  ['2 Zehen Knoblauch', 'Knoblauch · 2 Zehe'],
  ['1 Bund Petersilie', 'Petersilie · 1 Bund'],
  ['2 EL Tomatenmark', 'Tomatenmark · 2 EL'],
  ['1 Prise Salz', 'Salz · 1 Prise'],

  // Zahl ohne Einheit → Stück
  ['3 Eier', 'Eier · 3 Stueck'],
  ['2 Paprika', 'Paprika · 2 Stueck'],

  // Brüche und Punkt als Trenner
  ['1/2 l Sahne', 'Sahne · 0.5 l'],
  ['1.5 kg Kartoffeln', 'Kartoffeln · 1.5 kg'],

  // Spanne → untere Grenze
  ['2-3 EL Olivenöl', 'Olivenöl · 2 EL'],

  // Mehrwortnamen bleiben zusammen
  ['200 g geriebener Käse', 'geriebener Käse · 200 g'],
  ['1 Packung Blätterteig', 'Blätterteig · 1 Packung'],

  // Gar keine Menge
  ['Petersilie', 'Petersilie · 1 Stueck'],

  // Schreibweisen der Einheit
  ['250 Gramm Butter', 'Butter · 250 g'],
  ['1 Liter Wasser', 'Wasser · 1 l'],
  ['3 Stk Zwiebeln', 'Zwiebeln · 3 Stueck'],
];

function format(input: string): string {
  const parsed = parseIngredientInput(input);
  if (!parsed) return '(nichts)';
  return `${parsed.name} · ${parsed.quantity.amount} ${parsed.quantity.unit}`;
}

let failures = 0;
console.log('\n── Zutaten-Parser ──\n');
for (const [input, expected] of CASES) {
  const actual = format(input);
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${input.padEnd(24)} → ${actual}${ok ? '' : `   ERWARTET: ${expected}`}`);
}

// Eingaben, aus denen sich keine Zutat machen lässt
console.log('');
for (const junk of ['', '   ', '500', '2 EL']) {
  const parsed = parseIngredientInput(junk);
  const ok = parsed === null;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} "${junk}" → ${ok ? 'abgelehnt' : `${parsed?.name} (haette abgelehnt werden muessen)`}`);
}

/**
 * Zweiter Teil: die ganze Kette. Getippter Text → zerlegt → Produkt im
 * Laden gefunden. Genau das, was beim Anlegen eines Rezepts passiert.
 */
async function checkLookup() {
  const { findProductFor } = await import('../src/domain/shoppingList');
  const { normalizeKey, toDutchSearchTerm } = await import('../src/domain/translate');
  const { AlbertHeijnProvider } = await import('../src/supermarkets/albertHeijn');

  const ah = new AlbertHeijnProvider();
  const typed = ['milch 0,5l', '500g Hackfleisch', '2 Zehen Knoblauch', '300 g Mehl', '3 Eier'];

  console.log('\n── Getippt → gefunden ──\n');
  for (const input of typed) {
    const parsed = parseIngredientInput(input);
    if (!parsed) {
      console.log(`  ✗ "${input}" liess sich nicht zerlegen`);
      failures++;
      continue;
    }
    const product = await findProductFor(
      {
        id: normalizeKey(parsed.name),
        name: parsed.name,
        quantity: parsed.quantity,
        searchTermNl: toDutchSearchTerm(parsed.name),
      },
      ah,
    );
    if (!product) {
      console.log(`  ✗ "${input}" → kein Produkt`);
      failures++;
      continue;
    }
    console.log(
      `  ✓ "${input}"`.padEnd(26) +
        `→ ${parsed.name} ${parsed.quantity.amount} ${parsed.quantity.unit}`.padEnd(30) +
        `→ ${product.title} (${product.packageSize}) €${product.price.toFixed(2)}`,
    );
  }
}

checkLookup().then(() => {
  console.log(
    failures === 0
      ? `\n✓ Parser und Produktsuche arbeiten korrekt.\n`
      : `\n✗ ${failures} Probleme.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
});
