/**
 * Prüft jeden Wörterbucheintrag gegen den echten Albert-Heijn-Katalog.
 *
 *   npm run check:dict
 *
 * Ein Eintrag kann grammatisch korrekt und trotzdem unbrauchbar sein:
 * „parmezaanse kaas" ist richtiges Niederländisch, führt bei AH aber nur
 * zu Käsecrackern aus der Snack-Abteilung. Solche Fehler findet man nur,
 * indem man tatsächlich sucht.
 *
 * Auffällig ist ein Eintrag, wenn er kaum Treffer hat oder wenn das beste
 * Produkt in einer Abteilung liegt, die für eine Grundzutat nicht plausibel
 * ist (Snacks, Fertiggerichte).
 */

import { DE_TO_NL } from '../src/domain/translate';
import { AlbertHeijnProvider } from '../src/supermarkets/albertHeijn';

/** Abteilungen, in denen eine Grundzutat normalerweise nicht liegt. */
const SUSPICIOUS_CATEGORIES = ['Borrel, chips, snacks', 'Maaltijden, salades', 'Koek, snoep'];

const MIN_RESULTS = 3;

async function main() {
  const ah = new AlbertHeijnProvider();
  const entries = Object.entries(DE_TO_NL);
  const problems: string[] = [];

  console.log(`\nPrüfe ${entries.length} Wörterbucheinträge gegen Albert Heijn …\n`);

  let cursor = 0;
  const results: string[] = new Array(entries.length);

  const worker = async () => {
    while (cursor < entries.length) {
      const index = cursor++;
      const [german, dutch] = entries[index];
      try {
        const { products, totalResults } = await ah.searchProducts(dutch, { size: 3 });
        const top = products[0];
        const category = top?.category ?? '—';
        const thin = totalResults < MIN_RESULTS;
        const odd = SUSPICIOUS_CATEGORIES.some((c) => category.startsWith(c));

        if (thin || odd) {
          const why = thin ? `nur ${totalResults} Treffer` : `Abteilung „${category}"`;
          problems.push(`  ${german} → "${dutch}"  (${why})\n      bester Treffer: ${top?.title ?? 'keiner'}`);
          results[index] = `  ✗ ${german.padEnd(18)} → ${dutch}`;
        } else {
          results[index] = `  ✓ ${german.padEnd(18)} → ${dutch.padEnd(22)} ${String(totalResults).padStart(4)} Treffer · ${category}`;
        }
      } catch (err) {
        results[index] = `  ! ${german.padEnd(18)} → Fehler: ${(err as Error).message}`;
      }
    }
  };

  await Promise.all([worker(), worker(), worker()]);
  results.forEach((line) => console.log(line));

  if (problems.length === 0) {
    console.log('\n✓ Alle Einträge liefern plausible Produkte.\n');
  } else {
    console.log(`\n${problems.length} auffällige ${problems.length === 1 ? 'Eintrag' : 'Einträge'}:\n`);
    problems.forEach((p) => console.log(p));
    console.log('');
  }
}

main();
