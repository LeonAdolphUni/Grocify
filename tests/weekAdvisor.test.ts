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
  lockerungsStufen,
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

/* ── Stufenweise lockern ───────────────────────────────────────────── */

describe('lockerungsStufen', () => {
  it('beginnt immer mit dem, was der Nutzer wollte', () => {
    // Die gewünschte Einstellung muss die erste sein — sonst bekäme er
    // gelockerte Ergebnisse, obwohl strenge möglich gewesen wären.
    assert.deepEqual(lockerungsStufen(20, 2)[0], { minutes: 20, budget: 2 });
  });

  it('lockert erst die Zeit, dann das Geld', () => {
    // Zwanzig Minuten sind bei Allerhande hart — die meisten Rezepte
    // liegen bei 30 bis 40. Zehn Minuten mehr öffnen das Feld, ohne dass
    // es teurer wird. Am Budget zu rütteln kostet dagegen sofort Geld.
    const stufen = lockerungsStufen(20, 2);
    const budgets = stufen.map((s) => s.budget);
    const zeiten = stufen.map((s) => s.minutes);

    // Die Zeit ist schon frei, bevor sich am Budget etwas ändert.
    const ersteZeitLockerung = zeiten.findIndex((z) => z !== 20);
    const ersteGeldLockerung = budgets.findIndex((b) => b !== 2);
    assert.ok(
      ersteZeitLockerung < ersteGeldLockerung,
      'Zeit muss vor dem Budget gelockert werden',
    );
  });

  it('endet ohne jede Grenze', () => {
    const letzte = lockerungsStufen(20, 2).at(-1);
    assert.deepEqual(letzte, { minutes: undefined, budget: undefined });
  });

  it('erfindet keine Stufen, wenn nichts zu lockern ist', () => {
    // Ohne Grenzen gibt es nur einen Durchlauf — alles andere wäre
    // dieselbe Auswahl noch einmal.
    assert.equal(lockerungsStufen(undefined, undefined).length, 1);
  });

  it('lockert nur, was gesetzt ist', () => {
    for (const s of lockerungsStufen(undefined, 3)) assert.equal(s.minutes, undefined);
    for (const s of lockerungsStufen(30, undefined)) assert.equal(s.budget, undefined);
  });

  it('hebt das Budget um die Hälfte, bevor es ganz fällt', () => {
    // Ein Sprung von 2 € auf „egal" wäre grob. Die Zwischenstufe gibt
    // dem Nutzer eine Chance, knapp darüber zu landen statt beliebig.
    const budgets = lockerungsStufen(undefined, 2).map((s) => s.budget);
    assert.deepEqual(budgets, [2, 3, undefined]);
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
