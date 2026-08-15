/**
 * Produktauswahl und Zutaten-Zusammenfassung.
 *
 * **Das ist der Test, der am dringendsten fehlte.** `chooseBestProduct` wurde
 * in einer Woche dreimal nachjustiert, und kontrolliert wurde jedes Mal, indem
 * `npm run try:week` lief und die Gesamtsumme mit der vorherigen verglichen
 * wurde. Das ist eine Messung gegen ein Sortiment, dessen Preise sich täglich
 * ändern — sie beweist nicht, dass die Regeln stimmen, nur dass die Summe
 * gleich blieb.
 *
 * Hier laufen dieselben Regeln gegen **erfundene Produkte mit festen Preisen**.
 * Kein Netzwerk, kein Sortiment, keine Tagesform. Jeder Fall bildet eine
 * Fehlzuordnung ab, die tatsächlich vorkam.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chooseBestProduct, mergeIngredients } from '../src/domain/shoppingList';
import type { Ingredient, Product, Recipe } from '../src/domain/types';

/** Produkt zusammenbauen — nur die Felder, die die Auswahl liest. */
function p(title: string, price: number, packageSize = '', available = true): Product {
  const size = packageSize || '1 stuk';
  const match = /^([\d.,]+)\s*(g|kg|ml|l|stuks?|stuk)$/i.exec(size.trim());
  const amount = match ? Number(match[1].replace(',', '.')) : 1;
  const rawUnit = match ? match[2].toLowerCase() : 'stuk';
  const unit =
    rawUnit === 'kg' ? 'kg' : rawUnit === 'l' ? 'l' : rawUnit === 'g' ? 'g' : rawUnit === 'ml' ? 'ml' : 'Stueck';

  return {
    id: title.toLowerCase().replace(/\W+/g, '-'),
    provider: 'albertHeijn',
    title,
    price,
    packageSize: size,
    packageQuantity: { amount, unit: unit as Product['packageQuantity'] extends undefined ? never : 'g' },
    isAvailable: available,
  } as Product;
}

const required = (amount: number, dimension: string) => ({ amount, dimension });

describe('chooseBestProduct — Inhalt schlägt Preis', () => {
  it('wählt nicht das billigste, wenn es etwas anderes ist', () => {
    // Der Urfall: Für „tomaten" liefert die Suche Ketchup und Passata,
    // beides billiger als echte Tomaten.
    const best = chooseBestProduct(
      [p('AH Tomatenketchup', 0.99, '570 g'), p('AH Tomaten', 2.29, '500 g')],
      required(500, 'mass'),
      'tomaten',
    );
    assert.equal(best?.product.title, 'AH Tomaten');
  });

  it('Plural zählt als dasselbe Wort', () => {
    // „ui" gegen „Gele uien" — ohne diese Regel fiele das Grundprodukt raus.
    const best = chooseBestProduct(
      [p('AH Uiensoep', 1.19, '570 ml'), p('AH Gele uien', 1.09, '1 kg')],
      required(300, 'mass'),
      'ui',
    );
    assert.equal(best?.product.title, 'AH Gele uien');
  });

  it('Kompositum am Ende ist eine Sorte und zählt', () => {
    // „scharreleieren" ist eine Sorte Eier — brauchbar.
    const best = chooseBestProduct([p('AH Scharreleieren', 2.49, '10 stuks')], required(6, 'count'), 'eieren');
    assert.equal(best?.product.title, 'AH Scharreleieren');
  });

  it('weniger Zusatzwörter gewinnt gegen billiger', () => {
    const best = chooseBestProduct(
      [p('AH Tomaten passata gezeefd', 0.85, '500 g'), p('AH Tomaten', 1.29, '500 g')],
      required(400, 'mass'),
      'tomaten',
    );
    assert.equal(best?.product.title, 'AH Tomaten');
  });

  it('bei gleichem Rang entscheidet der Gesamtpreis, nicht der Kilopreis', () => {
    // 200 g Bedarf: die 500-g-Packung reicht und ist billiger als 1 kg,
    // obwohl der Kilopreis der großen besser ist.
    const best = chooseBestProduct(
      [p('AH Tarwebloem', 0.85, '1 kg'), p('AH Tarwebloem', 0.55, '500 g')],
      required(200, 'mass'),
      'tarwebloem',
    );
    assert.equal(best?.total, 0.55);
    assert.equal(best?.packages, 1);
  });

  it('rundet auf ganze Packungen auf', () => {
    const best = chooseBestProduct([p('AH Melk', 1.19, '1 l')], required(2500, 'volume'), 'melk');
    assert.equal(best?.packages, 3, '2,5 l Bedarf braucht 3 Kartons');
  });
});

describe('chooseBestProduct — Rückfall aufs Grundwort', () => {
  it('nimmt bei mehrwortigem Begriff das Grundwort, wenn nichts vollständig passt', () => {
    // Genau der Fehler vom 15.08.: Für „hokkaido pompoen" fand kein Produkt
    // beide Wörter, die Auswahl blieb ungefiltert, und das billigste gewann —
    // Kürbisbrötchen statt Kürbis.
    const best = chooseBestProduct(
      [
        p('AH Robuust pompoen broodjes', 2.49, '6 stuks'),
        p('AH Biologisch Pompoen', 3.78, '1 kg'),
      ],
      required(1000, 'mass'),
      'hokkaido pompoen',
    );
    assert.equal(best?.product.title, 'AH Biologisch Pompoen');
  });

  it('greift nicht, wenn der volle Begriff einen Treffer hat', () => {
    const best = chooseBestProduct(
      [p('AH Pompoen', 1.99, '1 kg'), p('AH Hokkaido pompoen', 2.99, '1 kg')],
      required(1000, 'mass'),
      'hokkaido pompoen',
    );
    assert.equal(best?.product.title, 'AH Hokkaido pompoen', 'der genaue Treffer muss gewinnen');
  });
});

describe('chooseBestProduct — lieber nichts als etwas Falsches', () => {
  it('trägt kein Treffer den Begriff, wird nichts vorgeschlagen', () => {
    // Der Kondom-Fall vom 15.08.: „Nudel" stand nicht im Wörterbuch, ging
    // unübersetzt an AH, dessen unscharfe Suche daraus „nude" machte — und
    // weil kein Treffer das Wort „nudel" enthielt, griff der Relevanzfilter
    // nicht und das billigste Ergebnis gewann.
    //
    // Jetzt kommt gar kein Vorschlag: Die Zeile wird als „selbst zuordnen"
    // markiert. Ein sichtbares Loch füllt der Nutzer, eine falsche Zeile
    // übersieht er bis zur Kasse.
    const best = chooseBestProduct(
      [
        p('Durex Condooms nude classic', 12.37, '1 stuk'),
        p("L'Oreal Paris nude magique CC cream", 17.99, '1 stuk'),
      ],
      required(500, 'mass'),
      'nudel',
    );
    assert.equal(best, null);
  });

  it('ein einziger echter Treffer reicht aber', () => {
    const best = chooseBestProduct(
      [p('Durex Condooms nude classic', 12.37), p('AH Nudelsoep', 1.29, '570 ml')],
      required(500, 'volume'),
      'nudel',
    );
    assert.equal(best?.product.title, 'AH Nudelsoep');
  });

  it('ohne Suchbegriff bleibt die alte Regel: das billigste gewinnt', () => {
    // Dieser Weg wird genutzt, wenn der Nutzer selbst ein Produkt festgelegt
    // hat — dann gibt es nichts zu filtern.
    const best = chooseBestProduct([p('Irgendwas', 3.0), p('Billiger', 1.0)], null, '');
    assert.equal(best?.product.title, 'Billiger');
  });
});

describe('chooseBestProduct — Randfälle', () => {
  it('leere Kandidatenliste gibt null statt zu werfen', () => {
    assert.equal(chooseBestProduct([], required(100, 'mass'), 'egal'), null);
  });

  it('nicht verfügbare Produkte werden übergangen, solange es Alternativen gibt', () => {
    const best = chooseBestProduct(
      [p('AH Melk', 0.79, '1 l', false), p('AH Halfvolle melk', 1.19, '1 l', true)],
      required(1000, 'volume'),
      'melk',
    );
    assert.equal(best?.product.isAvailable, true);
  });

  it('ist alles ausverkauft, wird trotzdem etwas vorgeschlagen', () => {
    // Lieber ein vergriffenes Produkt anzeigen als eine leere Zeile — der
    // Nutzer sieht dann im Laden selbst, ob es dasteht.
    const best = chooseBestProduct([p('AH Melk', 0.79, '1 l', false)], required(1000, 'volume'), 'melk');
    assert.ok(best, 'auch ohne verfügbare Ware kommt ein Vorschlag');
  });

  it('ohne Bedarfsangabe wird eine Packung angenommen', () => {
    const best = chooseBestProduct([p('AH Peterselie', 1.19, '1 stuk')], null, 'peterselie');
    assert.equal(best?.packages, 1);
  });
});

describe('mergeIngredients — der eigentliche Nutzen des Wochenplans', () => {
  const ing = (name: string, amount: number, unit: Ingredient['quantity']['unit']): Ingredient => ({
    id: name.toLowerCase(),
    name,
    searchTermNl: name.toLowerCase(),
    quantity: { amount, unit },
    rawText: `${amount} ${unit} ${name}`,
    isPantryStaple: false,
  });

  const recipe = (title: string, ingredients: Ingredient[]): Recipe => ({
    id: title.toLowerCase(),
    title,
    servings: 2,
    ingredients,
  });

  it('fasst dieselbe Zutat aus zwei Rezepten zusammen', () => {
    const merged = mergeIngredients([
      recipe('Auflauf', [ing('Käse', 150, 'g')]),
      recipe('Pizza', [ing('Käse', 100, 'g')]),
    ]);
    const kaese = merged.find((i) => i.name === 'Käse');
    assert.equal(merged.length, 1, 'eine Zeile, nicht zwei');
    assert.equal(kaese?.quantity.amount, 250);
  });

  it('rechnet verschiedene Einheiten derselben Dimension zusammen', () => {
    const merged = mergeIngredients([
      recipe('A', [ing('Milch', 0.5, 'l')]),
      recipe('B', [ing('Milch', 200, 'ml')]),
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].quantity.amount, 700, '0,5 l + 200 ml = 700 ml');
    assert.equal(merged[0].quantity.unit, 'ml');
  });

  it('wirft verschiedene Dimensionen NICHT zusammen', () => {
    // „2 Stück Paprika" und „100 g Paprika" sind nicht addierbar. Sie zu
    // addieren wäre schlimmer als zwei Zeilen zu zeigen.
    const merged = mergeIngredients([
      recipe('A', [ing('Paprika', 2, 'Stueck')]),
      recipe('B', [ing('Paprika', 100, 'g')]),
    ]);
    assert.equal(merged.length, 2, 'zwei getrennte Zeilen');
  });

  it('verschiedene Zutaten bleiben getrennt', () => {
    const merged = mergeIngredients([
      recipe('A', [ing('Mehl', 200, 'g'), ing('Zucker', 100, 'g')]),
    ]);
    assert.equal(merged.length, 2);
  });
});
