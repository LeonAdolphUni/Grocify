/**
 * Der Gericht-Finder — Filter, Quellen, Vorrat, Preis-Zwischenablage.
 *
 * Diese Tests entstanden aus echten Beschwerden über echte Durchläufe: eine
 * Woche für 41,36 € bei 7 % Verwertung, später ein einzelnes Gericht für
 * 12,38 € bei 14 %. Die Ursachen lagen nie im Preis, sondern in der Auswahl
 * — Joghurtriegel für zwölf Personen, auf eine heruntergerechnet.
 *
 * Kein Netz: `findDishes` selbst zieht Seiten von ah.nl und gehört deshalb
 * nicht in die Testsuite. Geprüft werden die Entscheidungen, die es trifft.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CATEGORIES } from '../server/allerhande';
import {
  aussortieren,
  istVegetarisch,
  lockerungsStufen,
  pantryAlsWuensche,
  quellenFuer,
  withPriceCache,
} from '../server/dishFinder';
import type { PantryItem } from '../src/domain/pantry';
import { translateSearchQuery } from '../src/domain/searchLanguage';
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

/* ── Schnell oder in Ruhe ──────────────────────────────────────────── */

describe('quellenFuer', () => {
  it('fragt im schnellen Modus zuerst AHs schnelle Rezepte', () => {
    // Der Grund, warum das nicht bloss ein Zeitfilter ist: Die meisten
    // Allerhande-Rezepte liegen bei 30 bis 40 Minuten. Ein gemessener Lauf
    // mit 20 Minuten warf 19 von 20 Kandidaten weg — bei 15 bliebe nichts
    // uebrig. AHs eigene Auswahl ist die bessere Quelle als ein scharfer
    // Filter auf beliebigen Rezepten.
    assert.equal(quellenFuer('schnell')[0], 'snelle-recepten');
  });

  it('sucht sonst zuerst bei den guenstigen', () => {
    assert.equal(quellenFuer('egal')[0], 'budget-recepten');
  });

  it('nennt in beiden Faellen mehrere Quellen', () => {
    // Eine einzige Quelle liefert immer dieselben neun Rezepte.
    assert.ok(quellenFuer('schnell').length >= 2);
    assert.ok(quellenFuer('egal').length >= 2);
  });

  it('nennt nur Kategorien, die es bei AH wirklich gibt', () => {
    // Sonst laeuft der Finder ins Leere. Jede Kategorie in CATEGORIES wurde
    // einzeln gegen ah.nl geprueft — dieser Test verhindert, dass hier ein
    // ausgedachter Slug einzieht.
    const bekannt = new Set(CATEGORIES.map((c) => c.slug));
    for (const modus of ['schnell', 'egal'] as const) {
      for (const slug of quellenFuer(modus)) {
        assert.ok(bekannt.has(slug), `${slug} steht nicht in CATEGORIES`);
      }
    }
  });
});

/* ── Vorrat aufbrauchen ────────────────────────────────────────────── */

describe('pantryAlsWuensche', () => {
  const eintrag = (name: string, updatedAt: string): PantryItem => ({
    id: name,
    name,
    quantity: { amount: 1, unit: 'Stueck' },
    updatedAt,
  });

  /** Attrappe: reicht den Namen klein durch, damit die Reihenfolge sichtbar bleibt. */
  const durchreichen = (n: string) => n.toLowerCase();

  it('nimmt das Aelteste zuerst — das muss am dringendsten weg', () => {
    const vorrat = [
      eintrag('Paprika', '2026-08-14T10:00:00Z'),
      eintrag('Reis', '2026-08-01T10:00:00Z'),
      eintrag('Joghurt', '2026-08-10T10:00:00Z'),
    ];
    assert.deepEqual(pantryAlsWuensche(vorrat, durchreichen), ['reis', 'joghurt', 'paprika']);
  });

  it('laesst Vorratsware weg', () => {
    // Nach einem Rezept fuer Salz zu suchen ist sinnlos — und aufbrauchen
    // will man Salz auch nicht.
    const vorrat = [
      eintrag('Salz', '2026-08-01T10:00:00Z'),
      eintrag('Oel', '2026-08-02T10:00:00Z'),
      eintrag('Linsen', '2026-08-03T10:00:00Z'),
    ];
    assert.deepEqual(pantryAlsWuensche(vorrat, durchreichen), ['linsen']);
  });

  it('nimmt hoechstens drei — jeder Begriff kostet eine gedrosselte Anfrage', () => {
    const vorrat = ['a', 'b', 'c', 'd', 'e'].map((n, i) =>
      eintrag(n, `2026-08-0${i + 1}T10:00:00Z`),
    );
    assert.equal(pantryAlsWuensche(vorrat, durchreichen).length, 3);
  });

  it('uebersetzt die Namen', () => {
    // Der Vorrat steht in der Sprache des Nutzers, AH sucht auf
    // Niederlaendisch. Ohne Uebersetzung findet "Haehnchen" nichts.
    const vorrat = [eintrag('Hähnchen', '2026-08-01T10:00:00Z')];
    assert.deepEqual(pantryAlsWuensche(vorrat, (n) => translateSearchQuery(n, 'de')), ['kip']);
  });

  it('leerer Vorrat ergibt keine Wuensche', () => {
    assert.deepEqual(pantryAlsWuensche([], durchreichen), []);
  });

  it('wirft Eintraege weg, die zu nichts uebersetzen', () => {
    // Ein leerer Suchbegriff wuerde bei AH die ganze Trefferliste ziehen.
    const vorrat = [eintrag('Linsen', '2026-08-01T10:00:00Z')];
    assert.deepEqual(pantryAlsWuensche(vorrat, () => '   '), []);
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
