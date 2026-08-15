/**
 * Chefkoch-Import.
 *
 * `fetch` wird durch eine Attrappe ersetzt: Getestet wird die Umformung von
 * Chefkochs Datenstruktur in unser Modell, nicht Chefkochs Verfügbarkeit.
 * Der echte Aufruf steckt in `npm run try:import` und braucht Netzwerk.
 *
 * Das ist genau die Stelle, an der beim ersten Probelauf drei Fehler saßen:
 * Pluralklammern („Zwiebel(n)"), Menge 0 für „nach Geschmack", und Zutaten
 * ohne Namen als Trennzeilen. Alle drei stehen hier als Testfall.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { ChefkochError, importRecipe, searchRecipes } from '../server/chefkoch';

/** Ersetzt fetch durch eine Antwort nach Wahl. */
function stubFetch(payload: unknown, ok = true, status = 200) {
  mock.method(globalThis, 'fetch', async () =>
    ({
      ok,
      status,
      json: async () => payload,
    }) as Response,
  );
}

afterEach(() => mock.restoreAll());

/** Ein Rezept, wie Chefkoch es tatsächlich liefert. */
const DETAIL = {
  id: '955491201155012',
  title: 'Hokkaido-Kürbissuppe',
  servings: 6,
  siteUrl: 'https://www.chefkoch.de/rezepte/955491201155012/Hokkaido-Kuerbissuppe.html',
  ingredientGroups: [
    {
      header: '',
      ingredients: [
        { name: 'Hokkaidokürbis(se)', unit: 'kg', amount: 1 },
        { name: 'Zwiebel(n)', unit: 'm.-große', amount: 2 },
        { name: 'Butter', unit: 'g', amount: 30 },
        { name: 'Wasser', unit: 'Liter', amount: 1.25 },
        // Menge 0 = „nach Geschmack"
        { name: 'Salz und Pfeffer', unit: '', amount: 0 },
        { name: 'Muskat', unit: '', amount: 0 },
        // Trennzeile ohne Namen
        { name: '', unit: '', amount: 0 },
      ],
    },
  ],
};

describe('importRecipe — Grundgerüst', () => {
  it('übernimmt Titel, Portionen und Quelle', async () => {
    stubFetch(DETAIL);
    const r = await importRecipe('955491201155012', 'eigene-id');
    assert.equal(r.id, 'eigene-id', 'wir vergeben unsere eigene ID');
    assert.equal(r.title, 'Hokkaido-Kürbissuppe');
    assert.equal(r.servings, 6);
    assert.match(r.sourceUrl ?? '', /chefkoch\.de/);
  });

  it('importiert KEINEN Zubereitungstext', async () => {
    // Bewusste Entscheidung: Zutatenlisten sind in der Regel nicht
    // urheberrechtlich geschützt, Zubereitungstexte schon.
    stubFetch({ ...DETAIL, instructions: 'Kürbis würfeln, anbraten …' });
    const r = await importRecipe('1', 'x');
    assert.equal((r as unknown as Record<string, unknown>).instructions, undefined);
  });

  it('nimmt mindestens eine Portion an, wenn Chefkoch keine nennt', async () => {
    stubFetch({ ...DETAIL, servings: undefined });
    assert.ok((await importRecipe('1', 'x')).servings >= 1);
  });
});

describe('importRecipe — Pluralklammern', () => {
  it('entfernt angehängte Endungen', async () => {
    // Ohne das ginge „Zwiebel(n)" unübersetzt an einen niederländischen
    // Supermarkt und fände nichts.
    stubFetch(DETAIL);
    const namen = (await importRecipe('1', 'x')).ingredients.map((i) => i.name);
    assert.ok(namen.includes('Zwiebel'), `„Zwiebel" erwartet, war: ${namen.join(', ')}`);
    assert.ok(namen.includes('Hokkaidokürbis'));
    assert.ok(!namen.some((n) => n.includes('(')), 'keine Klammer darf überleben');
  });

  it('lässt Klammern mit Abstand davor stehen — die tragen Information', async () => {
    stubFetch({
      ...DETAIL,
      ingredientGroups: [{ ingredients: [{ name: 'Tomaten (passiert)', unit: 'g', amount: 400 }] }],
    });
    const r = await importRecipe('1', 'x');
    assert.equal(r.ingredients[0].name, 'Tomaten (passiert)');
  });

  it('übersetzt die bereinigten Namen', async () => {
    stubFetch(DETAIL);
    const zwiebel = (await importRecipe('1', 'x')).ingredients.find((i) => i.name === 'Zwiebel');
    assert.equal(zwiebel?.searchTermNl, 'ui', 'erst bereinigen, dann nachschlagen');
  });
});

describe('importRecipe — „nach Geschmack"', () => {
  it('Menge 0 wird zu Vorratsware statt zu einer 0er-Zeile', async () => {
    stubFetch(DETAIL);
    const r = await importRecipe('1', 'x');
    const muskat = r.ingredients.find((i) => i.name === 'Muskat');
    assert.equal(muskat?.isPantryStaple, true, 'gehört nicht auf die Einkaufsliste');
    assert.equal(muskat?.quantity.amount, 1, 'keine Menge 0 im Modell');
    assert.match(muskat?.rawText ?? '', /nach Geschmack/);
  });

  it('„Salz und Pfeffer" als eine Zeile wird ebenfalls Vorrat', async () => {
    stubFetch(DETAIL);
    const r = await importRecipe('1', 'x');
    assert.equal(r.ingredients.find((i) => i.name === 'Salz und Pfeffer')?.isPantryStaple, true);
  });

  it('echte Mengen bleiben unangetastet', async () => {
    stubFetch(DETAIL);
    const butter = (await importRecipe('1', 'x')).ingredients.find((i) => i.name === 'Butter');
    assert.equal(butter?.quantity.amount, 30);
    assert.equal(butter?.quantity.unit, 'g');
    assert.equal(butter?.isPantryStaple, false);
  });

  it('unbekannte Einheiten werden zu Stück statt geraten', async () => {
    // Chefkoch schreibt „m.-große" als Einheit — das ist keine.
    stubFetch(DETAIL);
    const zwiebel = (await importRecipe('1', 'x')).ingredients.find((i) => i.name === 'Zwiebel');
    assert.equal(zwiebel?.quantity.unit, 'Stueck');
    assert.equal(zwiebel?.quantity.amount, 2);
  });
});

describe('importRecipe — Fehlerfälle', () => {
  it('Zutaten ohne Namen fallen heraus (Chefkochs Trennzeilen)', async () => {
    stubFetch(DETAIL);
    const r = await importRecipe('1', 'x');
    assert.equal(r.ingredients.length, 6, 'sieben Einträge, einer davon leer');
    assert.ok(!r.ingredients.some((i) => !i.name.trim()));
  });

  it('ein Rezept ganz ohne verwertbare Zutaten wird abgelehnt', async () => {
    stubFetch({ ...DETAIL, ingredientGroups: [{ ingredients: [{ name: '', amount: 0 }] }] });
    await assert.rejects(() => importRecipe('1', 'x'), ChefkochError);
  });

  it('fehlende ingredientGroups werfen statt abzustürzen', async () => {
    stubFetch({ id: '1', title: 'Leer' });
    await assert.rejects(() => importRecipe('1', 'x'), ChefkochError);
  });

  it('ein HTTP-Fehler wird als ChefkochError gemeldet', async () => {
    stubFetch(null, false, 503);
    await assert.rejects(() => importRecipe('1', 'x'), (err: Error) => {
      assert.ok(err instanceof ChefkochError);
      assert.match(err.message, /503/);
      return true;
    });
  });
});

describe('searchRecipes', () => {
  it('formt Chefkochs Treffer in unsere Struktur um', async () => {
    stubFetch({
      results: [
        {
          recipe: {
            id: '42',
            title: 'Lasagne',
            subtitle: 'klassisch',
            rating: { rating: 4.6, numVotes: 1200 },
            preparationTime: 30,
            previewImageUrlTemplate: 'https://img.example/<format>/bild.jpg',
            siteUrl: 'https://www.chefkoch.de/rezepte/42/Lasagne.html',
          },
        },
      ],
    });

    const [hit] = await searchRecipes('lasagne');
    assert.equal(hit.id, '42');
    assert.equal(hit.title, 'Lasagne');
    assert.equal(hit.rating, 4.6);
    assert.equal(hit.ratingCount, 1200);
    assert.equal(hit.preparationTime, 30);
    assert.ok(!hit.imageUrl?.includes('<format>'), 'die Bildvorlage muss ersetzt sein');
  });

  it('kommt ohne Treffer klar', async () => {
    stubFetch({ results: [] });
    assert.deepEqual(await searchRecipes('gibtsnicht'), []);
  });

  it('kommt ohne results-Feld klar', async () => {
    stubFetch({});
    assert.deepEqual(await searchRecipes('x'), []);
  });
});
