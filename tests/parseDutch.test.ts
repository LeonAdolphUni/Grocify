/**
 * Niederländische Zutatenzeilen von Allerhande.
 *
 * Alle Beispiele stammen aus echten Rezeptseiten. Der Parser hat eine
 * Aufgabe, die der deutsche nicht hat: Er darf den Namen **nicht**
 * übersetzen. Was AH in sein Rezept schreibt, ist bereits der Begriff, unter
 * dem AH das Produkt verkauft — jede Bearbeitung darüber hinaus macht den
 * Treffer schlechter, nicht besser.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseDutchIngredient,
  parseDutchNutritionValue,
  parseIsoDuration,
} from '../src/domain/parseDutch';

const f = (line: string) => {
  const p = parseDutchIngredient(line);
  return p ? `${p.name} · ${p.quantity.amount} ${p.quantity.unit}` : '(nichts)';
};

describe('parseDutchIngredient — Gewicht und Volumen', () => {
  const faelle: [string, string][] = [
    ['300 g biologische volkorenpenne', 'biologische volkorenpenne · 300 g'],
    ['1 kg aardappelen', 'aardappelen · 1 kg'],
    ['500 ml melk', 'melk · 500 ml'],
    ['1 l bouillon', 'bouillon · 1 l'],
    ['200 gram kaas', 'kaas · 200 g'],
  ];
  for (const [input, expected] of faelle) {
    it(`"${input}"`, () => assert.equal(f(input), expected));
  }
});

describe('parseDutchIngredient — niederländische Maßeinheiten', () => {
  const faelle: [string, string, string][] = [
    ['3 el milde olijfolie', 'milde olijfolie · 3 EL', 'eetlepel'],
    ['1 tl chilivlokken', 'chilivlokken · 1 TL', 'theelepel'],
    ['3 tenen knoflook', 'knoflook · 3 Zehe', 'Knoblauchzehen'],
    ['1 teentje knoflook', 'knoflook · 1 Zehe', 'Verkleinerung'],
    ['1 snufje zout', 'zout · 1 Prise', 'Prise'],
    ['1 bosje peterselie', 'peterselie · 1 Bund', 'Bund'],
    ['1 blik tomatenblokjes', 'tomatenblokjes · 1 Dose', 'Dose'],
    ['1 pak yoghurt', 'yoghurt · 1 Packung', 'Packung'],
  ];
  for (const [input, expected, warum] of faelle) {
    it(`"${input}" (${warum})`, () => assert.equal(f(input), expected));
  }
});

describe('parseDutchIngredient — Zahlenformate', () => {
  it('Dezimalpunkt', () => assert.equal(f('0.5 komkommer'), 'komkommer · 0.5 Stueck'));
  it('Dezimalkomma', () => assert.equal(f('1,5 kg aardappelen'), 'aardappelen · 1.5 kg'));
  it('Bruch', () => assert.equal(f('1/2 citroen'), 'citroen · 0.5 Stueck'));
  it('Spanne nimmt die untere Grenze', () =>
    assert.equal(f('2-3 el olie'), 'olie · 2 EL'));
  it('Zentiliter werden zu Millilitern', () =>
    assert.equal(f('20 cl room'), 'room · 200 ml'));
  it('ohne Menge gilt eine Einheit', () =>
    assert.equal(f('peper en zout'), 'peper en zout · 1 Stueck'));
});

describe('parseDutchIngredient — was abgeschnitten wird', () => {
  it('Größenangaben vorne fallen weg', () => {
    // „1 middelgrote ui" ist eine Zwiebel, keine mittelgroße Sache. Bliebe
    // das Adjektiv stehen, ginge es als Suchbegriff an die Produktsuche.
    assert.equal(f('1 middelgrote ui'), 'ui · 1 Stueck');
    assert.equal(f('200 g verse spinazie'), 'spinazie · 200 g');
    assert.equal(f('350 g fijne diepvries tuinerwten'), 'diepvries tuinerwten · 350 g');
  });

  it('Verpackungsangaben hinten fallen weg', () => {
    // Gemessen: „witte bonen in blik" fand nichts, „witte bonen" findet
    // „AH Terra Witte bonen".
    assert.equal(f('100 g witte bonen in blik'), 'witte bonen · 100 g');
    assert.equal(f('1 pot pesto uit pot'), 'pesto · 1 Dose');
  });

  it('aber nicht, was die Zutat ausmacht', () => {
    // „bonen in tomatensaus" ist etwas anderes als „bonen".
    assert.equal(f('400 g bonen in tomatensaus'), 'bonen in tomatensaus · 400 g');
  });

  it('der Name bleibt sonst unangetastet', () => {
    // Der wichtigste Test dieser Datei: kein Übersetzen, kein Kürzen.
    assert.equal(f('100 g smeerkaas naturel'), 'smeerkaas naturel · 100 g');
    assert.equal(f('350 g diepvries gebroken sperziebonen'), 'diepvries gebroken sperziebonen · 350 g');
  });
});

describe('parseDutchIngredient — Ablehnung', () => {
  it('leere Zeile', () => assert.equal(parseDutchIngredient(''), null));
  it('nur Leerzeichen', () => assert.equal(parseDutchIngredient('   '), null));
  it('nur eine Menge ohne Namen', () => assert.equal(parseDutchIngredient('300 g'), null));
});

describe('parseDutchNutritionValue', () => {
  it('liest die Zahl aus AHs Textform', () => {
    assert.equal(parseDutchNutritionValue('520 kcal energie'), 520);
    assert.equal(parseDutchNutritionValue('14 g vet'), 14);
    assert.equal(parseDutchNutritionValue('3 g waarvan verzadigd'), 3);
  });

  it('verkraftet Dezimalstellen', () => {
    assert.equal(parseDutchNutritionValue('1,5 g zout'), 1.5);
  });

  it('gibt undefined bei Unlesbarem', () => {
    assert.equal(parseDutchNutritionValue(undefined), undefined);
    assert.equal(parseDutchNutritionValue('onbekend'), undefined);
  });
});

describe('parseIsoDuration', () => {
  it('Minuten', () => assert.equal(parseIsoDuration('PT25M'), 25));
  it('Stunden und Minuten', () => assert.equal(parseIsoDuration('PT1H30M'), 90));
  it('nur Stunden', () => assert.equal(parseIsoDuration('PT2H'), 120));
  it('undefined bleibt undefined', () => assert.equal(parseIsoDuration(undefined), undefined));
  it('Unbekanntes ergibt undefined statt einer Zahl', () =>
    assert.equal(parseIsoDuration('halbe Stunde'), undefined));
});
