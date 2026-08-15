/**
 * Suchbegriffe für Allerhande übersetzen.
 *
 * Der Anlass ist ein gemeldeter Fehler: Wer „Eiersalat" eingibt, bekam
 * nichts — Allerhande kennt nur „eiersalade". Alle Fälle hier wurden gegen
 * die echte Suche geprüft; die Erwartungen sind keine Vermutungen.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  describeTranslation,
  SEARCH_LANGUAGES,
  translateSearchQuery,
} from '../src/domain/searchLanguage';

describe('translateSearchQuery — Deutsch', () => {
  it('übersetzt den gemeldeten Fall', () => {
    // „Eiersalat" fand nichts, „eiersalade" findet Rezepte.
    assert.equal(translateSearchQuery('Eiersalat', 'de'), 'eiersalade');
  });

  it('kennt einzelne Zutaten', () => {
    assert.equal(translateSearchQuery('Hähnchen', 'de'), 'kip');
    assert.equal(translateSearchQuery('Kartoffeln', 'de'), 'aardappelen');
    assert.equal(translateSearchQuery('Käse', 'de'), 'kaas');
  });

  it('übersetzt Wort für Wort', () => {
    assert.equal(translateSearchQuery('vegetarisch schnell', 'de'), 'vegetarisch snel');
  });

  it('löst zusammengesetzte Wörter über die Endung auf', () => {
    // Der eigentliche Trick: „Kürbissuppe" steht in keiner Tabelle, aber
    // „-suppe" wird zu „-soep" und „Kürbis" zu „pompoen".
    assert.equal(translateSearchQuery('Kürbissuppe', 'de'), 'pompoensoep');
    assert.equal(translateSearchQuery('Tomatensuppe', 'de'), 'tomatensoep');
  });

  it('greift auch bei Wörtern, die niemand eingetragen hat', () => {
    // Deutsch und Niederländisch sind nah verwandt — die Endungsregel
    // funktioniert auch für Zutaten, die die Tabelle nicht kennt.
    assert.equal(translateSearchQuery('Krabbensalat', 'de'), 'krabbensalade');
  });

  it('lässt international gleiche Wörter stehen', () => {
    assert.equal(translateSearchQuery('pasta', 'de'), 'pasta');
    assert.equal(translateSearchQuery('curry', 'de'), 'curry');
  });

  it('verkraftet Umlaute und Großschreibung', () => {
    assert.equal(translateSearchQuery('KÜRBIS', 'de'), 'pompoen');
    assert.equal(translateSearchQuery('  Gemüse ', 'de'), 'groente');
  });
});

describe('translateSearchQuery — Englisch', () => {
  it('kennt ganze Wendungen', () => {
    assert.equal(translateSearchQuery('egg salad', 'en'), 'eiersalade');
  });

  it('übersetzt Wort für Wort', () => {
    assert.equal(translateSearchQuery('chicken soup', 'en'), 'kip soep');
    assert.equal(translateSearchQuery('healthy pasta', 'en'), 'gezond pasta');
  });

  it('kennt einzelne Zutaten', () => {
    assert.equal(translateSearchQuery('mushrooms', 'en'), 'champignons');
    assert.equal(translateSearchQuery('potatoes', 'en'), 'aardappelen');
  });
});

describe('translateSearchQuery — Niederländisch', () => {
  it('lässt alles unangetastet', () => {
    // Wer schon Niederländisch tippt, braucht keine Übersetzung — und jede
    // wäre eine Verschlechterung.
    assert.equal(translateSearchQuery('eiersalade', 'nl'), 'eiersalade');
    assert.equal(translateSearchQuery('kip met rijst', 'nl'), 'kip met rijst');
  });
});

describe('translateSearchQuery — Randfälle', () => {
  it('leere Eingabe bleibt leer', () => {
    assert.equal(translateSearchQuery('', 'de'), '');
    assert.equal(translateSearchQuery('   ', 'de'), '');
  });

  it('Unbekanntes geht unverändert durch statt verstümmelt zu werden', () => {
    assert.equal(translateSearchQuery('Wunderpulver', 'de'), 'wunderpulver');
  });
});

describe('describeTranslation', () => {
  it('meldet, wenn übersetzt wurde', () => {
    const d = describeTranslation('Eiersalat', 'de');
    assert.equal(d.translated, 'eiersalade');
    assert.equal(d.changed, true);
  });

  it('meldet, wenn nichts passiert ist', () => {
    // Sonst stünde unter jedem Suchfeld ein Hinweis, der nichts erklärt.
    assert.equal(describeTranslation('pasta', 'de').changed, false);
    assert.equal(describeTranslation('kip', 'nl').changed, false);
  });
});

describe('SEARCH_LANGUAGES', () => {
  it('bietet genau die drei Sprachen mit Beispiel', () => {
    assert.deepEqual(SEARCH_LANGUAGES.map((l) => l.id), ['de', 'nl', 'en']);
    for (const l of SEARCH_LANGUAGES) {
      assert.ok(l.label, `${l.id} braucht einen Namen`);
      assert.ok(l.hint, `${l.id} braucht ein Beispiel für den Platzhalter`);
    }
  });
});
