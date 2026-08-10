/**
 * Smoke-Test der Albert-Heijn-Anbindung.
 *
 * Läuft ohne App und ohne Gerät: `npm run smoke`
 *
 * Zweck ist zu unterscheiden, ob ein Problem an der App oder an der
 * Datenquelle liegt. Wenn AH seine API ändert oder dichtmacht, schlägt
 * dieser Test fehl, bevor du im Simulator suchst.
 */

import { AlbertHeijnProvider, parsePackageSize } from '../src/supermarkets/albertHeijn';

const euro = (v: number) => `€${v.toFixed(2)}`;

async function main() {
  const ah = new AlbertHeijnProvider();
  let failures = 0;

  // 1. Gebindegrößen-Parser — reine Logik, kein Netz
  console.log('\n── Gebindegrößen-Parser ──');
  const cases: [string | undefined, string][] = [
    ['1 kg', '1 kg'],
    ['500 g', '500 g'],
    ['1 l', '1 l'],
    ['250 ml', '250 ml'],
    ['6 stuks', '6 Stueck'],
    ['20 cl', '200 ml'],
    ['per stuk', '—'],
    [undefined, '—'],
  ];
  for (const [input, expected] of cases) {
    const parsed = parsePackageSize(input);
    const actual = parsed ? `${parsed.amount} ${parsed.unit}` : '—';
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? '✓' : '✗'} ${String(input).padEnd(10)} → ${actual}`);
  }

  // 2. Produktsuche — echter Netzwerkaufruf
  console.log('\n── Produktsuche "tarwebloem" ──');
  try {
    const result = await ah.searchProducts('tarwebloem', { size: 5 });
    console.log(`  ${result.totalResults} Treffer gesamt\n`);
    for (const p of result.products) {
      const size = p.packageQuantity
        ? `${p.packageQuantity.amount} ${p.packageQuantity.unit}`
        : p.packageSize || '?';
      console.log(
        `  ${euro(p.price).padStart(7)}  ${p.title.padEnd(38).slice(0, 38)}  ` +
          `${size.padEnd(10)} ${p.category ?? ''}${p.isOnSale ? '  [BONUS]' : ''}`,
      );
    }
    if (result.products.length === 0) failures++;
  } catch (err) {
    failures++;
    console.log(`  ✗ FEHLGESCHLAGEN: ${(err as Error).message}`);
  }

  // 3. Kategoriebaum — Grundlage für Stöbern und für die Sortierung der Liste
  console.log('\n── Abteilungen ──');
  try {
    const cats = await ah.getCategories();
    console.log(`  ${cats.length} Abteilungen: ${cats.slice(0, 5).map((c) => c.name).join(', ')} …`);
    if (cats.length === 0) failures++;

    const withImage = cats.filter((c) => c.imageUrl).length;
    console.log(`  ${withImage} davon mit Bild`);

    // 4. Eine Ebene tiefer und dann Produkte — der Weg beim Stöbern
    const first = cats[0];
    const subs = await ah.getSubCategories(first.id);
    console.log(`\n── Unterabteilungen von „${first.name}" ──`);
    console.log(`  ${subs.length}: ${subs.slice(0, 5).map((c) => c.name).join(', ')} …`);
    if (subs.length === 0) failures++;

    const target = subs[0] ?? first;
    const browsed = await ah.browseCategory(target.id, { size: 4 });
    console.log(`\n── Produkte in „${target.name}" (${browsed.totalResults} gesamt) ──`);
    for (const p of browsed.products) {
      console.log(`  ${euro(p.price).padStart(7)}  ${p.title.padEnd(38).slice(0, 38)} ${p.packageSize}`);
    }
    if (browsed.products.length === 0) failures++;
  } catch (err) {
    failures++;
    console.log(`  ✗ FEHLGESCHLAGEN: ${(err as Error).message}`);
  }

  console.log(
    failures === 0
      ? '\n✓ Durchstich steht: App-Code erreicht echte Albert-Heijn-Preise.\n'
      : `\n✗ ${failures} Problem(e) — Details oben.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
