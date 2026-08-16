/**
 * Der Vorrat: was schon zu Hause steht.
 *
 * Ohne ihn kauft die App jede Woche 500 g Mehl, obwohl noch 800 g im Schrank
 * stehen. Der Wochenplan optimiert bisher nur *innerhalb* eines Einkaufs —
 * dass zwischen zwei Einkäufen etwas übrig bleibt, ist ihm nicht bekannt.
 *
 * Bewusst getrennt von der Vorratsware-Erkennung in `translate.ts`: Die sagt
 * „Salz hat man üblicherweise", das hier sagt „ich habe genau 240 g Reis".
 * Das eine ist eine Annahme über alle Haushalte, das andere eine Angabe über
 * diesen.
 *
 * **Abgezogen wird nur, was sich vergleichen lässt.** Stehen 2 Zwiebeln im
 * Vorrat und das Rezept braucht 300 g, wird nichts abgezogen, solange kein
 * Stückgewicht bekannt ist — lieber einmal zu viel kaufen als mit zu wenig
 * am Herd stehen.
 */

import { translateSearchQuery, type SearchLanguage } from './searchLanguage';
import { normalizeKey } from './translate';
import type { Ingredient } from './types';
import { toBaseForIngredient, type Dimension } from './units';
import type { Quantity } from './units';

export interface PantryItem {
  /** Kanonischer Schlüssel, wie bei Zutaten: normalisierter deutscher Name. */
  id: string;
  name: string;
  quantity: Quantity;
  /**
   * Wann zuletzt bestätigt. Ein Vorrat, den niemand pflegt, wird schnell
   * zur Lüge — die Oberfläche kann damit auf alte Einträge hinweisen.
   */
  updatedAt: string;
  /** Freitext des Nutzers, etwa „im Gefrierfach" oder „läuft bald ab". */
  note?: string;
}

/** Ergebnis der Verrechnung einer Zutat gegen den Vorrat. */
export interface PantryDeduction {
  /** Was nach Abzug noch gekauft werden muss. */
  remaining: Quantity;
  /** Wie viel aus dem Vorrat gedeckt wurde, in der Einheit der Zutat. */
  covered: number;
  /** Vollständig gedeckt — die Zeile kann von der Liste verschwinden. */
  fullyCovered: boolean;
  /** Warum nichts abgezogen wurde, wenn nichts abgezogen wurde. */
  skipped?: 'nicht im Vorrat' | 'Mengen nicht vergleichbar';
}

/** Schlüssel für den Abgleich — dieselbe Normalisierung wie überall. */
export function pantryKey(name: string): string {
  return normalizeKey(name);
}

/**
 * Deutsche Pluralendungen, die an den Wortstamm treten.
 *
 * Bewusst nur die angehängten: Umlautplurale („Apfel" → „Äpfel") ändern den
 * Stamm und stehen deshalb unten als Ausnahmen.
 */
const PLURAL_ENDUNGEN = ['n', 'en', 'e', 'er', 's', 'nen'];

/**
 * Wortpaare, die sich nicht über eine Endung ableiten lassen.
 *
 * Entweder weil der Stamm sich ändert (Umlaut) oder weil das Wort zu kurz
 * für die Endungsregel ist — „ei" hat nur zwei Buchstaben, und bei so
 * kurzen Stämmen träfe die Regel auch auf „Eis" zu.
 */
const UNREGELMAESSIG: Record<string, string> = {
  ei: 'eier',
  apfel: 'aepfel',
  wurst: 'wuerste',
  saft: 'saefte',
  soss: 'soossen',
  nuss: 'nuesse',
  glas: 'glaeser',
  dose: 'dosen',
};

/**
 * Meinen zwei Namen dieselbe Zutat?
 *
 * Zwei echte Fehler haben diese Funktion geformt.
 *
 * **Der Plural.** Wer „2 Zwiebeln" in den Vorrat tippt — der natürliche
 * deutsche Plural —, dessen Eintrag lief unter `zwiebeln`. Im Rezept steht
 * aber `zwiebel`, weil der Import die Einzahl liefert. Der Abgleich fand
 * nichts, und der Vorrat wurde kommentarlos ignoriert. Verglichen wird
 * deshalb Stamm gegen Stamm plus bekannte Pluralendung; mindestens drei
 * Zeichen Stamm, sonst würde „Eis" zum Plural von „Ei".
 *
 * **Die Sprache.** Seit die Rezepte aus Allerhande kommen, stehen ihre
 * Zutaten auf **Niederländisch** — der Vorrat aber in der Sprache, in der
 * der Nutzer tippt. „Reis" gegen „rijst", „Zwiebel" gegen „ui", „Käse"
 * gegen „kaas": alles unähnlich, alles derselbe Gegenstand. Gemessen wurde
 * damit **gar nichts** mehr abgezogen, außer bei Zufallstreffern wie
 * „Paprika"/„paprika" — die ganze Vorratsfunktion war still ausgefallen,
 * seit die Rezeptquelle gewechselt hat.
 *
 * Deshalb wird zusätzlich über die Suchübersetzung verglichen, und zwar in
 * **beide Richtungen**: Es steht nicht fest, welcher der beiden Namen der
 * deutsche ist.
 */
export function sameIngredientName(a: string, b: string, from: SearchLanguage = 'de'): boolean {
  if (gleicherStamm(a, b)) return true;

  // Bei „nl" ist die Übersetzung die Identität — der Vergleich oben hat
  // dann schon entschieden.
  if (from === 'nl') return false;

  // **Plural und Sprache müssen zusammen greifen.** Getrennt scheitert
  // genau der Fall, der im Alltag vorkommt: Man tippt „2 Zwiebeln", das
  // Rezept sagt „ui". Die Pluralregel oben kommt von „zwiebeln" nicht auf
  // „ui", und das Wörterbuch kennt „zwiebel", nicht „zwiebeln". Deshalb
  // wird jede Singularform übersetzt, nicht nur das Wort wie getippt.
  for (const kandidat of singularformen(a)) {
    if (gleicherStamm(translateSearchQuery(kandidat, from), b)) return true;
  }
  for (const kandidat of singularformen(b)) {
    if (gleicherStamm(a, translateSearchQuery(kandidat, from))) return true;
  }
  return false;
}

/**
 * Das Wort selbst plus die Singularformen, die daraus entstehen können.
 *
 * Rein mechanisch — ob „zwiebel" ein Wort ist, entscheidet erst das
 * Wörterbuch. Ein Fehlgriff („Rei" aus „Reis") übersetzt zu sich selbst und
 * trifft dann nichts, kostet also nur einen Vergleich.
 */
function singularformen(name: string): string[] {
  const wort = name.trim().toLowerCase();
  const formen = [wort];

  for (const endung of PLURAL_ENDUNGEN) {
    if (wort.length - endung.length >= 3 && wort.endsWith(endung)) {
      formen.push(wort.slice(0, -endung.length));
    }
  }
  return formen;
}

/** Der reine Namensvergleich: Gleichheit, unregelmäßiger Plural, Stamm + Endung. */
function gleicherStamm(a: string, b: string): boolean {
  const ka = normalizeKey(a);
  const kb = normalizeKey(b);
  if (ka === kb) return true;

  if (UNREGELMAESSIG[ka] === kb || UNREGELMAESSIG[kb] === ka) return true;

  // Auch über die niederländische Form vergleichen: Allerhande schreibt
  // „rode paprika's", „rode uien", „zilvervliesrijst" — Adjektiv davor,
  // Plural hinten, Kopf im Kompositum ganz hinten.
  const na = nlStamm(a);
  const nb = nlStamm(b);
  if (na.stamm && nb.stamm) {
    if (na.stamm === nb.stamm) return true;
    // Die Kompositum-Regel nur, wenn beide Namen ausschließlich aus Kopf
    // und bekannten Beiwörtern bestehen — sonst verschluckt sie das Wort,
    // auf das es ankommt.
    if (na.rein && nb.rein && kopfGleich(na.stamm, nb.stamm)) return true;
  }

  const [kurz, lang] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  if (kurz.length < 3 || !lang.startsWith(kurz)) return false;

  return PLURAL_ENDUNGEN.includes(lang.slice(kurz.length));
}

/**
 * Niederländische Beiwörter, die den Gegenstand nicht ändern.
 *
 * **Sehr bewusst eng gehalten.** „Rode paprika" ist eine Paprika und „grote
 * ui" eine Zwiebel — aber „zoete aardappel" ist **keine** Kartoffel, und
 * „gedroogde linzen" sind nicht dasselbe wie frische. Wer Geschmacks- und
 * Verarbeitungswörter mitstreicht, verrechnet Süßkartoffeln gegen
 * Kartoffeln und lässt den Nutzer vor dem Regal stehen. Farbe und Größe
 * sind sicher, alles andere nicht.
 */
const NL_BEIWORT = new Set([
  'rode', 'rood', 'gele', 'geel', 'groene', 'groen', 'witte', 'wit',
  'bruine', 'bruin', 'grote', 'groot', 'kleine', 'klein', 'middelgrote',
  'middelgroot', 'halve', 'hele', 'verse', 'vers', 'biologische',
  'biologisch', 'fijne', 'grove',
]);

/**
 * Reduziert einen niederländischen Zutatennamen auf seinen Stamm.
 *
 * Bekannte Beiwörter fallen weg, die Pluralendung des letzten Wortes auch:
 * `rode paprika's` → `paprika`, `uien` → `ui`.
 *
 * `rein` sagt, ob dabei **nur** bekannte Beiwörter weggefallen sind. Bleibt
 * ein unbekanntes Wort stehen — „zoete aardappelen" —, wird es Teil des
 * Stamms und der Name gilt als unrein. Das ist der Unterschied zwischen
 * Kartoffel und Süßkartoffel, und ohne diese Unterscheidung verrechnet die
 * App die beiden gegeneinander.
 */
function nlStamm(name: string): { stamm: string; rein: boolean } {
  const woerter = name
    .toLowerCase()
    .replace(/['’]s\b/g, 's')
    .split(/[^a-zà-ÿ]+/)
    .filter(Boolean);

  while (woerter.length > 1 && NL_BEIWORT.has(woerter[0])) woerter.shift();
  if (woerter.length === 0) return { stamm: '', rein: false };

  const kopf = woerter[woerter.length - 1];
  let kern = kopf;
  // Mindestlänge **je Endung**, nicht pauschal. „ui" ist ein echtes
  // zweibuchstabiges Wort, `uien` muss also auf zwei Zeichen schrumpfen
  // dürfen. Beim `-s` wäre dieselbe Großzügigkeit ein Fehler: Sie machte
  // aus „Eis" ein „Ei" und verrechnete Speiseeis gegen Eier.
  for (const [endung, mindestens] of [['eren', 2], ['en', 2], ['s', 3]] as const) {
    if (kopf.endsWith(endung) && kopf.length - endung.length >= mindestens) {
      kern = kopf.slice(0, -endung.length);
      break;
    }
  }

  // Was vor dem Kopf übrig blieb, ist unbekannt und gehört zum Namen.
  const rest = woerter.slice(0, -1);
  return { stamm: [...rest, kern].join(''), rein: rest.length === 0 };
}

/**
 * Paare, die sich zwar hinten gleichen, aber verschiedene Dinge sind.
 *
 * **„aardappel" endet auf „appel".** Ohne diese Sperre verrechnet die App
 * Kartoffeln gegen Äpfel — und der Nutzer steht ohne Kartoffeln da, weil
 * die Liste sie für gedeckt hielt. Genau der Fehlertyp, den diese Datei
 * sonst verhindert.
 */
const KEINE_KOMPOSITA: [string, string][] = [['aardappel', 'appel']];

/**
 * Ist das eine Wort das Kompositum des anderen?
 *
 * `zilvervliesrijst` ist Reis, `volkorenpasta` ist Pasta. Verlangt werden
 * **mindestens fünf Zeichen** im Kopfwort: Bei kurzen Wörtern wie „ui" oder
 * „kip" träfe die Regel zufällig auf alles Mögliche zu, und ein falscher
 * Treffer ist hier teurer als ein verpasster — er streicht eine Zutat von
 * der Einkaufsliste, die man wirklich braucht.
 */
function kopfGleich(a: string, b: string): boolean {
  const [kurz, lang] = a.length <= b.length ? [a, b] : [b, a];
  if (kurz.length < 5 || !lang.endsWith(kurz)) return false;

  return !KEINE_KOMPOSITA.some(
    ([x, y]) => (lang.startsWith(x) && kurz === y) || (lang.startsWith(y) && kurz === x),
  );
}

/**
 * Zieht den Vorrat von einer benötigten Menge ab.
 *
 * Gerechnet wird über die Basiseinheit, damit „0,5 l Milch" im Rezept gegen
 * „300 ml" im Vorrat aufgeht. Passen die Dimensionen nicht zusammen — Stück
 * gegen Gramm —, wird **nichts** abgezogen und der Grund vermerkt.
 */
export function deductFromPantry(
  ingredient: Pick<Ingredient, 'id' | 'name' | 'quantity'>,
  pantry: PantryItem[],
): PantryDeduction {
  const key = ingredient.id || pantryKey(ingredient.name);
  // Über den Namen vergleichen, nicht nur über den Schlüssel: „Zwiebeln"
  // im Vorrat und „Zwiebel" im Rezept sind dieselbe Zutat.
  const stock = pantry.find(
    (p) =>
      p.id === key ||
      sameIngredientName(p.name, ingredient.name) ||
      sameIngredientName(p.id, key),
  );

  if (!stock) {
    return { remaining: ingredient.quantity, covered: 0, fullyCovered: false, skipped: 'nicht im Vorrat' };
  }

  const need = toBaseForIngredient(ingredient.quantity, key);
  const have = toBaseForIngredient(stock.quantity, key);

  if (!need || !have || need.dimension !== have.dimension) {
    return {
      remaining: ingredient.quantity,
      covered: 0,
      fullyCovered: false,
      skipped: 'Mengen nicht vergleichbar',
    };
  }

  if (have.amount >= need.amount) {
    return {
      remaining: { amount: 0, unit: ingredient.quantity.unit },
      covered: ingredient.quantity.amount,
      fullyCovered: true,
    };
  }

  // Teilweise gedeckt: Der Rest wird in der Basiseinheit weitergereicht,
  // damit keine krummen Umrechnungen entstehen („0,17 l" statt „170 ml").
  const restBase = need.amount - have.amount;
  const anteilGedeckt = have.amount / need.amount;

  return {
    remaining: { amount: restBase, unit: baseUnit(need.dimension) },
    covered: Math.round(ingredient.quantity.amount * anteilGedeckt * 100) / 100,
    fullyCovered: false,
  };
}

function baseUnit(dimension: Dimension): Quantity['unit'] {
  return dimension === 'mass' ? 'g' : dimension === 'volume' ? 'ml' : 'Stueck';
}

/**
 * Verbucht einen Einkauf im Vorrat.
 *
 * Nach dem Einkauf steht mehr im Schrank als vorher — sonst müsste man den
 * Vorrat von Hand nachtragen, und ein Vorrat, den man von Hand pflegt,
 * pflegt niemand.
 */
export function addToPantry(pantry: PantryItem[], name: string, quantity: Quantity): PantryItem[] {
  const key = pantryKey(name);
  const jetzt = new Date().toISOString();
  const vorhanden = pantry.find((p) => p.id === key);

  if (!vorhanden) {
    return [...pantry, { id: key, name, quantity, updatedAt: jetzt }];
  }

  const alt = toBaseForIngredient(vorhanden.quantity, key);
  const neu = toBaseForIngredient(quantity, key);

  // Nicht vergleichbar? Dann die neue Angabe nehmen statt zu addieren —
  // „2 Stück" und „500 g" zu summieren ergäbe eine Fantasiezahl.
  const zusammen =
    alt && neu && alt.dimension === neu.dimension
      ? { amount: alt.amount + neu.amount, unit: baseUnit(alt.dimension) }
      : quantity;

  return pantry.map((p) => (p.id === key ? { ...p, quantity: zusammen, updatedAt: jetzt } : p));
}

/**
 * Bucht den Verbrauch eines Gerichts aus dem Vorrat aus.
 *
 * Gebraucht für die Wochenplanung: Wenn Montag die zwei Zwiebeln verkocht,
 * sind sie Dienstag nicht mehr da. Ohne diese Verrechnung bekämen alle
 * Gerichte der Woche Punkte für dieselben zwei Zwiebeln, und der Planer
 * würde behaupten, der Vorrat sei mehrfach gedeckt.
 *
 * Gibt den verbleibenden Vorrat zurück; das Original bleibt unverändert.
 */
export function consumeFromPantry(
  pantry: PantryItem[],
  ingredients: Pick<Ingredient, 'id' | 'name' | 'quantity'>[],
): PantryItem[] {
  let rest = pantry;

  for (const ing of ingredients) {
    rest = rest.flatMap((eintrag) => {
      const passt =
        eintrag.id === (ing.id || pantryKey(ing.name)) ||
        sameIngredientName(eintrag.name, ing.name);
      if (!passt) return [eintrag];

      const have = toBaseForIngredient(eintrag.quantity, eintrag.id);
      const need = toBaseForIngredient(ing.quantity, ing.id || pantryKey(ing.name));

      // Nicht vergleichbar? Dann lieber stehen lassen als falsch abbuchen.
      if (!have || !need || have.dimension !== need.dimension) return [eintrag];

      const uebrig = have.amount - need.amount;
      if (uebrig <= 0) return []; // aufgebraucht

      return [
        {
          ...eintrag,
          quantity: { amount: Math.round(uebrig * 100) / 100, unit: baseUnit(have.dimension) },
        },
      ];
    });
  }

  return rest;
}

/** Entfernt leere Einträge — ein Vorrat mit „0 g Mehl" ist kein Vorrat. */
export function prunePantry(pantry: PantryItem[]): PantryItem[] {
  return pantry.filter((p) => p.quantity.amount > 0);
}

/** Wie alt ist der älteste Eintrag, in Tagen? Für den Hinweis „lange nicht gepflegt". */
export function stalestDays(pantry: PantryItem[], now = Date.now()): number | null {
  if (pantry.length === 0) return null;
  const aeltester = pantry.reduce((min, p) => Math.min(min, Date.parse(p.updatedAt) || now), now);
  return Math.floor((now - aeltester) / 86_400_000);
}
