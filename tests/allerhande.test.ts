/**
 * Allerhande — Bilder aus dem Seitengerüst und niederländische Vorratsware.
 *
 * Beides ohne Netz: Die HTML-Schnipsel unten sind die Formen, in denen AH
 * Bildadressen ausliefert, die Zutatennamen stammen aus echten importierten
 * Rezepten.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { firstRecipeImage, imageFromJsonLd, isDutchStaple } from '../server/allerhande';

/* ── Bilder aus dem HTML ───────────────────────────────────────────── */

describe('firstRecipeImage', () => {
  it('findet die nackte Adresse in einem src-Attribut', () => {
    const html = '<img src="https://static.ah.nl/static/recepten/img_123_1224x900_JPG.jpg" alt="">';
    assert.equal(
      firstRecipeImage(html),
      'https://static.ah.nl/static/recepten/img_123_1224x900_JPG.jpg',
    );
  });

  it('findet sie auch hinter der Bildoptimierung von Next.js', () => {
    // Dort steht die echte Adresse prozentkodiert in einem url-Parameter.
    const html =
      '<img src="/_next/image?url=https%3A%2F%2Fstatic.ah.nl%2Fstatic%2Frecepten%2Fimg_9_600x400_JPG.jpg&w=640">';
    assert.equal(
      firstRecipeImage(html),
      'https://static.ah.nl/static/recepten/img_9_600x400_JPG.jpg',
    );
  });

  it('schneidet angehängte Parameter ab', () => {
    const html = '<img src="https://static.ah.nl/static/recepten/img_1.jpg&amp;w=640&amp;q=75">';
    assert.equal(firstRecipeImage(html), 'https://static.ah.nl/static/recepten/img_1.jpg');
  });

  it('gibt nichts zurück, wenn kein Bild da ist', () => {
    // Wichtig, dass das `undefined` ist und nicht ein leerer String: Die
    // Oberfläche entscheidet daran, ob sie das Monogramm zeigt.
    assert.equal(firstRecipeImage('<div>kein Bild</div>'), undefined);
  });

  it('lässt sich von anderen ah.nl-Bildern nicht täuschen', () => {
    // Produktfotos liegen unter /static/product/, nicht /static/recepten/.
    const html = '<img src="https://static.ah.nl/static/product/AHI_123.jpg">';
    assert.equal(firstRecipeImage(html), undefined);
  });
});

/* ── Bilder aus dem JSON-LD ────────────────────────────────────────── */

describe('imageFromJsonLd', () => {
  it('überspringt den leeren ersten Eintrag', () => {
    // AH liefert tatsächlich `["", "https://…"]`. Wer `[0]` nimmt, bekommt
    // einen leeren String und zeigt nie ein Bild an.
    const wert = ['', 'https://static.ah.nl/static/recepten/img_4036742_1224x900_JPG.jpg'];
    assert.equal(
      imageFromJsonLd(wert),
      'https://static.ah.nl/static/recepten/img_4036742_1224x900_JPG.jpg',
    );
  });

  it('nimmt auch eine einzelne Adresse', () => {
    assert.equal(imageFromJsonLd('https://static.ah.nl/x.jpg'), 'https://static.ah.nl/x.jpg');
  });

  it('versteht das ImageObject von schema.org', () => {
    assert.equal(
      imageFromJsonLd([{ '@type': 'ImageObject', url: 'https://static.ah.nl/y.jpg' }]),
      'https://static.ah.nl/y.jpg',
    );
  });

  it('kommt mit fehlendem oder leerem Feld zurecht', () => {
    assert.equal(imageFromJsonLd(undefined), undefined);
    assert.equal(imageFromJsonLd([]), undefined);
    assert.equal(imageFromJsonLd(['', '   ']), undefined);
  });
});

/* ── Niederländische Vorratsware ───────────────────────────────────── */

describe('isDutchStaple', () => {
  it('kennt die Gläser, die den Wochenpreis getrieben haben', () => {
    // Gemessen: 7,29 € Honig und 3,29 € Erdnussbutter für je einen Löffel
    // Bedarf — beide standen jede Woche neu auf der Einkaufsliste.
    assert.equal(isDutchStaple('vloeibare honing'), true);
    assert.equal(isDutchStaple('100% pindakaas'), true);
  });

  it('kennt Grundwürze und Öl', () => {
    for (const z of ['zout', 'peper', 'olijfolie', 'extra vergine olijfolie', 'suiker']) {
      assert.equal(isDutchStaple(z), true, `${z} ist Vorratsware`);
    }
  });

  it('kennt trockene Gewürze', () => {
    assert.equal(isDutchStaple('gerookte paprikapoeder'), true);
    assert.equal(isDutchStaple('chilivlokken'), true);
  });

  it('hält frische Kräuter NICHT für Vorratsware', () => {
    // „Verse oregano" ist ein Töpfchen für 1,99 €, das nach vier Tagen
    // welk ist. Wer es wie das Döschen behandelt, streicht dem Nutzer eine
    // Zutat von der Liste, die er wirklich kaufen muss.
    assert.equal(isDutchStaple('verse oregano'), false);
    assert.equal(isDutchStaple('verse basilicum'), false);
  });

  it('lässt echte Zutaten in Ruhe', () => {
    for (const z of ['kipfilet', 'courgette', 'penne', 'kokosmelk', 'ui']) {
      assert.equal(isDutchStaple(z), false, `${z} muss gekauft werden`);
    }
  });
});
