/**
 * Zutatenzeilen von Albert Heijn lesen.
 *
 * Allerhande liefert seine Zutaten als fertige Zeilen: „300 g biologische
 * volkorenpenne", „3 tenen knoflook", „0.5 citroen". Das ist dieselbe Form
 * wie beim deutschen Parser, aber in einer anderen Sprache und mit anderen
 * Maßeinheiten — Niederländer messen in `el` und `tl`, zählen Knoblauch in
 * `tenen` und Petersilie in `bosjes`.
 *
 * **Der entscheidende Unterschied zum Chefkoch-Import:** Der Zutatenname ist
 * schon der Suchbegriff. „Volkorenpenne" muss nicht übersetzt werden — es ist
 * bereits das Wort, unter dem Albert Heijn das Produkt führt. Damit fällt die
 * gesamte Übersetzungs- und Ratekette weg, die beim deutschen Import nötig
 * war, und mit ihr ihre Fehlerquellen.
 */

import type { Quantity, Unit } from './units';

/**
 * Niederländische Maßeinheiten auf unsere Einheiten.
 *
 * Die Zuordnung ist nicht immer eins zu eins: `teentje` ist eine
 * Knoblauchzehe, `snufje` eine Prise, `bosje` ein Bund. Was hier fehlt,
 * gilt als Stückzahl — das ist die ehrlichere Annahme als zu raten.
 */
const NL_EINHEITEN: Record<string, Unit> = {
  g: 'g',
  gr: 'g',
  gram: 'g',
  kg: 'kg',
  kilo: 'kg',
  ml: 'ml',
  cl: 'ml', // Zentiliter — unten mal 10 gerechnet
  dl: 'ml', // Deziliter — mal 100
  l: 'l',
  liter: 'l',

  el: 'EL',
  eetlepel: 'EL',
  eetlepels: 'EL',
  tl: 'TL',
  theelepel: 'TL',
  theelepels: 'TL',

  teen: 'Zehe',
  tenen: 'Zehe',
  teentje: 'Zehe',
  teentjes: 'Zehe',

  snuf: 'Prise',
  snufje: 'Prise',
  snufjes: 'Prise',
  mespunt: 'Msp',
  mespuntje: 'Msp',

  bos: 'Bund',
  bosje: 'Bund',
  bosjes: 'Bund',

  pak: 'Packung',
  pakje: 'Packung',
  pakjes: 'Packung',
  zak: 'Packung',
  zakje: 'Packung',
  zakjes: 'Packung',
  doos: 'Packung',
  bakje: 'Packung',
  bakjes: 'Packung',

  blik: 'Dose',
  blikje: 'Dose',
  blikjes: 'Dose',
  pot: 'Dose',
  potje: 'Dose',

  stuk: 'Stueck',
  stuks: 'Stueck',
  stuk_s: 'Stueck',
};

/** Faktoren für Einheiten, die auf eine andere Basis umgerechnet werden. */
const FAKTOR: Record<string, number> = { cl: 10, dl: 100 };

/**
 * Wörter, die vor dem eigentlichen Zutatennamen stehen und ihn nicht benennen.
 *
 * „1 middelgrote ui" ist eine Zwiebel, keine mittelgroße Sache. Bliebe das
 * Adjektiv im Namen, ginge es als Suchbegriff an die Produktsuche und
 * verschlechterte den Treffer.
 */
const GROESSENWOERTER = new Set([
  'middelgrote',
  'middelgroot',
  'grote',
  'groot',
  'kleine',
  'klein',
  'halve',
  'hele',
  'verse',
  'vers',
  'fijne',
  'fijn',
  'grof',
  'grove',
]);

export interface ParsedDutchIngredient {
  /** Der Name, wie AH ihn schreibt — zugleich der Suchbegriff. */
  name: string;
  quantity: Quantity;
  /** Die Originalzeile, für die Nachvollziehbarkeit. */
  raw: string;
}

/** Wandelt „0.5", „1,5" und „1/2" in eine Zahl. */
function toNumber(raw: string): number | null {
  const s = raw.trim().replace(',', '.');

  const bruch = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (bruch) {
    const n = Number(bruch[2]);
    return n === 0 ? null : Number(bruch[1]) / n;
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Liest eine Zutatenzeile von Allerhande.
 *
 * Erwartet die Form „Menge [Einheit] Name", also „300 g penne", „3 tenen
 * knoflook" oder „0.5 citroen". Fehlt die Menge, wird eine Einheit
 * angenommen — „peper en zout" ist eine Zutat, auch ohne Zahl.
 *
 * Gibt `null` nur zurück, wenn nach dem Abschneiden kein Name übrig bleibt.
 */
export function parseDutchIngredient(line: string): ParsedDutchIngredient | null {
  const raw = line.trim();
  if (!raw) return null;

  // Menge am Anfang: Zahl, Komma-/Punktzahl, Bruch oder Spanne („2-3").
  const mengeMatch = /^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)(?:\s*-\s*\d+(?:[.,]\d+)?)?\s*/.exec(raw);

  let amount = 1;
  let rest = raw;

  if (mengeMatch) {
    const n = toNumber(mengeMatch[1]);
    if (n !== null && n > 0) {
      amount = n;
      rest = raw.slice(mengeMatch[0].length);
    }
  }

  // Einheit direkt danach.
  //
  // Das `\s*` am Ende statt `\s+` ist wichtig: Ohne es bliebe bei einer
  // abgeschnittenen Zeile wie „300 g" das „g" als *Name* stehen, und die
  // Einkaufsliste enthielte eine Zutat namens „g". Mit `\s*` wird die
  // Einheit auch am Zeilenende erkannt, es bleibt kein Name übrig, und die
  // Zeile wird unten korrekt abgelehnt.
  let unit: Unit = 'Stueck';
  const wortMatch = /^([a-zA-ZàáäâèéëêìíïîòóöôùúüûçñÀ-ÿ]+)\.?\s*/.exec(rest);
  if (wortMatch) {
    const wort = wortMatch[1].toLowerCase();
    const gefunden = NL_EINHEITEN[wort];
    if (gefunden) {
      unit = gefunden;
      rest = rest.slice(wortMatch[0].length);
      const faktor = FAKTOR[wort];
      if (faktor) amount *= faktor;
    }
  }

  // Größenangaben vorne abschneiden — sie beschreiben nicht die Zutat.
  const woerter = rest.trim().split(/\s+/);
  while (woerter.length > 1 && GROESSENWOERTER.has(woerter[0].toLowerCase())) {
    woerter.shift();
  }

  const name = stripPackaging(woerter.join(' ').trim());
  if (!name) return null;

  return { name, quantity: { amount, unit }, raw };
}

/**
 * Schneidet Verpackungsangaben hinten ab.
 *
 * „witte bonen in blik" ist als Suchbegriff schlechter als „witte bonen":
 * Der Zusatz beschreibt die Verpackung, nicht das Lebensmittel, und AH führt
 * das Produkt unter dem Namen ohne ihn. Gemessen an einem echten Rezept war
 * das der Unterschied zwischen keinem Treffer und dem richtigen.
 *
 * Nur am Ende und nur diese Wendungen — „bonen in tomatensaus" ist etwas
 * anderes als „bonen" und bleibt stehen.
 */
function stripPackaging(name: string): string {
  const muster =
    /\s+(in|uit)\s+(blik|blikje|pot|potje|glas|zak|pak)$|\s+(vers|diepvries|gedroogd|gedroogde)$/i;
  const gekuerzt = name.replace(muster, '').trim();
  return gekuerzt || name;
}

/**
 * Liest AHs Nährwertblock aus dem JSON-LD.
 *
 * Die Werte kommen als Text mit Einheit und Beschreibung: „520 kcal energie",
 * „14 g vet". Gebraucht wird die Zahl davor.
 */
export function parseDutchNutritionValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /(\d+(?:[.,]\d+)?)/.exec(value);
  if (!m) return undefined;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Wandelt eine ISO-8601-Dauer („PT25M") in Minuten.
 *
 * Allerhande gibt die Zubereitungszeit in dieser Form an. Ohne Umrechnung
 * stünde „PT25M" in der Oberfläche.
 */
export function parseIsoDuration(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(iso.trim());
  if (!m) return undefined;
  const stunden = Number(m[1] ?? 0);
  const minuten = Number(m[2] ?? 0);
  const gesamt = stunden * 60 + minuten;
  return gesamt > 0 ? gesamt : undefined;
}
