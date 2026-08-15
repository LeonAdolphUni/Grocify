/**
 * Der Wochenplaner — Filter, Preis-Zwischenablage, Fleischerkennung.
 *
 * Diese Tests entstanden aus einer echten Beschwerde: Der erste Durchlauf
 * lieferte eine Woche für 41,36 € mit **7 % Verwertung**. Die Ursache war
 * nicht der Preis, sondern die Auswahl — Joghurtriegel für zwölf Personen,
 * auf eine heruntergerechnet. Was hier geprüft wird, ist genau das, was
 * damals fehlte.
 *
 * Kein Netz: `adviseWeek` selbst zieht Seiten von ah.nl und gehört deshalb
 * nicht in die Testsuite. Geprüft werden die Entscheidungen, die es trifft.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aussortieren,
  istVegetarisch,
  verbrauchterWert,
  withPriceCache,
} from '../server/weekAdvisor';
import type { Recipe } from '../src/domain/types';
import type { PriceProvider, SearchResult } from '../src/supermarkets/types';

/* ── Hilfsmittel ───────────────────────────────────────────────────── */

function rezept(titel: string, zutaten: string[], servings = 4): Recipe {
  return {
    id: titel,
    title: titel,
    servings,
    ingredients: zutaten.map((n) => ({
      id: n,
      name: n,
      quantity: { amount: 1, unit: 'Stueck' as const },
      rawText: n,
      isPantryStaple: false,
    })),
  };
}

function importiert(recipe: Recipe, extra: { category?: string; totalMinutes?: number } = {}) {
  return { recipe, diets: [], ...extra };
}

/* ── Der Portionsfilter ────────────────────────────────────────────── */

describe('aussortieren — Portionszahl', () => {
  it('wirft das Rezept weg, das die Beschwerde ausgelöst hat', () => {
    // „Yoghurtbars met fruit en noten", 12 Portionen. Auf eine Person
    // gerechnet braucht man ein Zwölftel Glas Honig — gekauft wird das
    // ganze Glas für 7,29 €.
    const grund = aussortieren(importiert(rezept('Yoghurtbars', ['honing'], 12)), {
      vegetarianOnly: false,
    });
    assert.equal(grund, 'für 12 Portionen');
  });

  it('lässt ein normales Abendessen durch', () => {
    assert.equal(
      aussortieren(importiert(rezept('Pasta pesto', ['penne', 'pesto'], 4)), {
        vegetarianOnly: false,
      }),
      null,
    );
  });

  it('sechs Portionen sind noch in Ordnung, sieben nicht mehr', () => {
    const bei = (n: number) =>
      aussortieren(importiert(rezept('X', ['ui'], n)), { vegetarianOnly: false });
    assert.equal(bei(6), null);
    assert.equal(bei(7), 'für 7 Portionen');
  });
});

/* ── Der Kategoriefilter ───────────────────────────────────────────── */

describe('aussortieren — Kategorie', () => {
  it('sortiert Snacks und Nachtische aus', () => {
    for (const kat of ['snack', 'nagerecht', 'borrelhapje', 'drankje']) {
      const grund = aussortieren(importiert(rezept('X', ['ui']), { category: kat }), {
        vegetarianOnly: false,
      });
      assert.equal(grund, `kein Hauptgericht (${kat})`, `${kat} sollte rausfallen`);
    }
  });

  it('lässt Hauptgerichte durch', () => {
    assert.equal(
      aussortieren(importiert(rezept('X', ['ui']), { category: 'hoofdgerecht' }), {
        vegetarianOnly: false,
      }),
      null,
    );
  });

  it('lässt eine unbekannte Kategorie durch, statt sie zu verwerfen', () => {
    // Sperrliste, nicht Erlaubnisliste: Führte AH eine neue Bezeichnung
    // ein, stünde der Planer sonst über Nacht ohne Vorschläge da.
    assert.equal(
      aussortieren(importiert(rezept('X', ['ui']), { category: 'maaltijdsalade' }), {
        vegetarianOnly: false,
      }),
      null,
    );
  });

  it('kommt ohne Kategorie zurecht', () => {
    assert.equal(aussortieren(importiert(rezept('X', ['ui'])), { vegetarianOnly: false }), null);
  });
});

/* ── Zeit ──────────────────────────────────────────────────────────── */

describe('aussortieren — Zubereitungszeit', () => {
  it('hält die Obergrenze ein', () => {
    const r = importiert(rezept('Schmorbraten', ['ui']), { totalMinutes: 120 });
    assert.equal(aussortieren(r, { vegetarianOnly: false, maxMinutes: 30 }), '120 Min');
  });

  it('ohne Obergrenze ist jede Dauer recht', () => {
    const r = importiert(rezept('Schmorbraten', ['ui']), { totalMinutes: 120 });
    assert.equal(aussortieren(r, { vegetarianOnly: false }), null);
  });

  it('ein Rezept ohne Zeitangabe wird nicht dafür bestraft', () => {
    // Fehlende Angabe ist keine lange Zubereitung. Wer sie so behandelt,
    // wirft alle Rezepte weg, bei denen AH die Zeit vergessen hat.
    assert.equal(
      aussortieren(importiert(rezept('X', ['ui'])), { vegetarianOnly: false, maxMinutes: 20 }),
      null,
    );
  });
});

/* ── Vegetarisch ───────────────────────────────────────────────────── */

describe('istVegetarisch', () => {
  it('erkennt Fleisch am Wortanfang, auch in Zusammensetzungen', () => {
    for (const z of ['kipfilet', 'rundergehakt', 'varkenshaas', 'spekblokjes', 'gerookte zalm']) {
      assert.equal(istVegetarisch(rezept('X', [z])), false, `${z} ist nicht vegetarisch`);
    }
  });

  it('hält Champignons für Gemüse', () => {
    // Der Fehler, der diesen Test erzwungen hat: „ham" steckt mitten in
    // „champignons". Mit Teilzeichenketten fiel jedes Pilzgericht aus dem
    // vegetarischen Filter — lautlos.
    assert.equal(istVegetarisch(rezept('Champignonrisotto', ['champignons', 'rijst'])), true);
  });

  it('verwechselt Kichererbsen nicht mit Hähnchen', () => {
    assert.equal(istVegetarisch(rezept('Curry', ['kikkererwten', 'kokosmelk'])), true);
  });

  it('lässt gewöhnliches Gemüse in Ruhe', () => {
    assert.equal(
      istVegetarisch(rezept('X', ['ui', 'paprika', 'courgette', 'balsamicoazijn', 'olijfolie'])),
      true,
    );
  });

  it('greift nur, wenn der Filter gesetzt ist', () => {
    const fleisch = importiert(rezept('X', ['kipfilet']));
    assert.equal(aussortieren(fleisch, { vegetarianOnly: false }), null);
    assert.equal(aussortieren(fleisch, { vegetarianOnly: true }), 'nicht vegetarisch');
  });
});

/* ── Was eine Portion wirklich kostet ──────────────────────────────── */

describe('verbrauchterWert', () => {
  it('rechnet den Rest heraus statt ihn der Mahlzeit anzulasten', () => {
    // Der gemessene Fall: „Kip in romige mosterdsaus" auf eine Person. Man
    // kauft für 43 € ein, verkocht davon aber nur einen Bruchteil — der
    // Rest liegt im Kühlschrank und ist kein verlorenes Geld.
    assert.equal(verbrauchterWert(43, 35, 1), 8);
  });

  it('ohne Rest ist der Preis der volle Einkauf', () => {
    assert.equal(verbrauchterWert(12, 0, 4), 3);
  });

  it('teilt durch die Portionen', () => {
    assert.equal(verbrauchterWert(20, 8, 4), 3);
  });

  it('wird nie negativ', () => {
    // Der Restwert ist anteilig geschätzt und kann die Summe rechnerisch
    // übersteigen. Ein negativer Preis wäre Unsinn und würde in der
    // Bewertung als bestmögliches Gericht durchgehen.
    assert.equal(verbrauchterWert(10, 12, 1), 0);
  });

  it('ohne Portionen gibt es keinen Preis je Portion', () => {
    assert.equal(verbrauchterWert(10, 2, 0), null);
  });

  it('rundet auf Cent', () => {
    assert.equal(verbrauchterWert(10, 0, 3), 3.33);
  });
});

/* ── Die Preis-Zwischenablage ──────────────────────────────────────── */

describe('withPriceCache', () => {
  /** Zählt, wie oft wirklich gesucht wurde. */
  function zaehlender() {
    let aufrufe = 0;
    const provider = {
      id: 'test',
      displayName: 'Test',
      available: true,
      async searchProducts(): Promise<SearchResult> {
        aufrufe++;
        return { products: [], totalResults: 0 };
      },
      async getProductById() {
        return null;
      },
      async getCategories() {
        return [];
      },
      async getSubCategories() {
        return [];
      },
      async browseCategory(): Promise<SearchResult> {
        return { products: [], totalResults: 0 };
      },
    } as unknown as PriceProvider;
    return { provider, zahl: () => aufrufe };
  }

  it('sucht denselben Begriff nur einmal', async () => {
    // Das ist der Grund, warum echte Preise überhaupt bezahlbar sind: „ui"
    // kommt bei zwölf Kandidaten ein Dutzend Mal vor.
    const { provider, zahl } = zaehlender();
    const cached = withPriceCache(provider);

    await cached.searchProducts('ui');
    await cached.searchProducts('ui');
    await cached.searchProducts('ui');

    assert.equal(zahl(), 1);
  });

  it('hält verschiedene Begriffe auseinander', async () => {
    const { provider, zahl } = zaehlender();
    const cached = withPriceCache(provider);

    await cached.searchProducts('ui');
    await cached.searchProducts('paprika');

    assert.equal(zahl(), 2);
  });

  it('lässt parallele Anfragen nicht doppelt suchen', async () => {
    // Deshalb wird das Versprechen abgelegt und nicht erst das Ergebnis:
    // Der Planer bewertet alle Kandidaten gleichzeitig.
    const { provider, zahl } = zaehlender();
    const cached = withPriceCache(provider);

    await Promise.all([
      cached.searchProducts('ui'),
      cached.searchProducts('ui'),
      cached.searchProducts('ui'),
    ]);

    assert.equal(zahl(), 1);
  });

  it('reicht die Angaben des Anbieters durch', () => {
    const { provider } = zaehlender();
    const cached = withPriceCache(provider);
    assert.equal(cached.id, 'test');
    assert.equal(cached.displayName, 'Test');
    assert.equal(cached.available, true);
  });
});
