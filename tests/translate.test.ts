/**
 * DE→NL-Wörterbuch und Vorratsware-Erkennung.
 *
 * Wichtig zur Abgrenzung: Ob ein Eintrag inhaltlich *stimmt* — ob es
 * „pompoen" bei Albert Heijn wirklich gibt —, prüft `npm run check:dict`
 * gegen den echten Katalog. Das braucht Netzwerk und gehört nicht hierher.
 *
 * Hier wird geprüft, was auch offline gelten muss: dass die Nachschlage-Regeln
 * greifen, dass Umlaute und Groß-/Kleinschreibung nicht durchfallen, und dass
 * ein unbekannter Begriff unverändert durchgereicht statt verstümmelt wird.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DE_TO_NL,
  DICTIONARY_SIZE,
  isPantryStaple,
  normalizeKey,
  toDutchSearchTerm,
} from '../src/domain/translate';

describe('normalizeKey', () => {
  it('macht Umlaute und ß nachschlagbar', () => {
    assert.equal(normalizeKey('Möhre'), 'moehre');
    assert.equal(normalizeKey('Käse'), 'kaese');
    assert.equal(normalizeKey('Weißkohl'), 'weisskohl');
    assert.equal(normalizeKey('Öl'), 'oel');
  });

  it('ignoriert Groß-/Kleinschreibung und Randleerzeichen', () => {
    assert.equal(normalizeKey('  MEHL  '), 'mehl');
  });

  it('verbindet mehrere Wörter mit Unterstrich', () => {
    assert.equal(normalizeKey('saure Sahne'), 'saure_sahne');
  });

  it('ist idempotent — zweimal angewendet ändert nichts', () => {
    const once = normalizeKey('Weißkohl');
    assert.equal(normalizeKey(once), once);
  });
});

describe('toDutchSearchTerm', () => {
  it('schlägt bekannte Zutaten nach', () => {
    assert.equal(toDutchSearchTerm('Mehl'), 'tarwebloem');
    assert.equal(toDutchSearchTerm('Zwiebel'), 'ui');
    assert.equal(toDutchSearchTerm('Möhre'), 'wortel');
  });

  it('funktioniert unabhängig von der Schreibweise', () => {
    assert.equal(toDutchSearchTerm('MEHL'), 'tarwebloem');
    assert.equal(toDutchSearchTerm('  mehl '), 'tarwebloem');
  });

  it('nutzt bei Komposita das Grundwort hinten', () => {
    // Im Deutschen steht das Grundwort am Ende: „Bio-Vollmilch" ist Milch.
    assert.equal(toDutchSearchTerm('Bio-Milch'), 'melk');
  });

  it('reicht Unbekanntes unverändert durch, statt es zu verstümmeln', () => {
    // Bei international gleichen Wörtern trifft das sogar oft.
    assert.equal(toDutchSearchTerm('Ravioli'), 'Ravioli');
  });

  it('Parmesan führt zum italienischen Namen, nicht zur wörtlichen Übersetzung', () => {
    // „parmezaanse kaas" klingt richtig, liefert bei AH aber nur Snacks.
    // Diese Entscheidung ist gemessen und soll nicht zurückgedreht werden.
    assert.equal(toDutchSearchTerm('Parmesan'), 'parmigiano reggiano');
  });
});

describe('isPantryStaple', () => {
  it('erkennt Vorratsware', () => {
    for (const name of ['Salz', 'Pfeffer', 'Zucker', 'Öl', 'Essig', 'Mehl', 'Wasser']) {
      assert.equal(isPantryStaple(name), true, `${name} sollte Vorrat sein`);
    }
  });

  it('erkennt Frischware nicht als Vorrat', () => {
    for (const name of ['Hackfleisch', 'Milch', 'Tomaten', 'Käse', 'Petersilie']) {
      assert.equal(isPantryStaple(name), false, `${name} sollte kein Vorrat sein`);
    }
  });

  it('ist schreibweisenunabhängig', () => {
    assert.equal(isPantryStaple('SALZ'), true);
    assert.equal(isPantryStaple(' Öl '), true);
  });
});

describe('Wörterbuch als Datenbestand', () => {
  it('DICTIONARY_SIZE stimmt mit der Tabelle überein', () => {
    assert.equal(DICTIONARY_SIZE, Object.keys(DE_TO_NL).length);
  });

  it('alle Schlüssel liegen in normalisierter Form vor', () => {
    // Ein Eintrag wie „Möhre" statt „moehre" würde nie gefunden — der
    // Nachschlagevorgang normalisiert die Eingabe, nicht die Tabelle.
    const schief = Object.keys(DE_TO_NL).filter((k) => normalizeKey(k) !== k);
    assert.deepEqual(schief, [], `nicht normalisierte Schlüssel: ${schief.join(', ')}`);
  });

  it('kein Eintrag ist leer', () => {
    const leer = Object.entries(DE_TO_NL).filter(([, v]) => !v.trim());
    assert.deepEqual(leer, []);
  });
});
