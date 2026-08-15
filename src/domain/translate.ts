/**
 * Brücke zwischen deutschen Rezepten und niederländischen Sortimenten.
 *
 * "Weizenmehl" muss zu "tarwebloem" werden, damit die Produktsuche etwas
 * findet. Das ist keine Übersetzung, sondern Produktkunde: "Quark" heißt
 * zwar "kwark", aber deutscher Schmand hat im niederländischen Regal kein
 * sauberes Gegenstück.
 *
 * ⚠️ Diese Tabelle ist ein Platzhalter für Sprint 6. Dort übernimmt die
 * Claude API die Zuordnung und kann auch mit unbekannten Zutaten,
 * Schreibvarianten und Mehrwortbegriffen umgehen. Bis dahin: was hier nicht
 * drinsteht, wird unverändert als Suchbegriff verwendet — was bei
 * international gleichen Wörtern (Broccoli, Pasta, Pizza) oft sogar trifft.
 */

/**
 * Deutscher Zutatenname (kleingeschrieben) → niederländischer Suchbegriff.
 *
 * Exportiert, damit `npm run check:dict` jeden Eintrag gegen den echten
 * Katalog prüfen kann. Einträge zu erfinden reicht nicht — „parmezaanse
 * kaas" klingt richtig, führt bei Albert Heijn aber nur zu Käsecrackern.
 */
export const DE_TO_NL: Record<string, string> = {
  // Backen & Trockenware
  mehl: 'tarwebloem',
  weizenmehl: 'tarwebloem',
  dinkelmehl: 'speltmeel',
  zucker: 'suiker',
  puderzucker: 'poedersuiker',
  vanillezucker: 'vanillesuiker',
  backpulver: 'bakpoeder',
  hefe: 'gist',
  salz: 'zout',
  pfeffer: 'peper',
  paprikapulver: 'paprikapoeder',
  zimt: 'kaneel',
  haferflocken: 'havermout',
  reis: 'rijst',
  nudel: 'pasta',
  nudeln: 'pasta',
  spaghetti: 'spaghetti',
  gnocchi: 'gnocchi',
  tagliatelle: 'tagliatelle',
  penne: 'penne',
  lasagneplatten: 'lasagne',
  couscous: 'couscous',
  linsen: 'linzen',
  kichererbsen: 'kikkererwten',

  // Molkerei & Eier
  milch: 'melk',
  butter: 'roomboter',
  margarine: 'margarine',
  sahne: 'slagroom',
  schlagsahne: 'slagroom',
  saure_sahne: 'zure room',
  // Schmand hat im niederländischen Regal kein sauberes Gegenstück.
  // Crème fraîche ist der praktische Ersatz und überall vorrätig — das ist
  // Produktkunde, keine Übersetzung.
  schmand: 'creme fraiche',
  creme_fraiche: 'creme fraiche',
  cremefraiche: 'creme fraiche',
  quark: 'kwark',
  joghurt: 'yoghurt',
  frischkaese: 'roomkaas',
  kaese: 'kaas',
  // Nicht "parmezaanse kaas": Darunter führt AH nur Snacks (Grissini,
  // Käsecracker), keinen echten Parmesan. Der Käse liegt unter dem
  // italienischen Namen.
  parmesan: 'parmigiano reggiano',
  mozzarella: 'mozzarella',
  ei: 'eieren',
  eier: 'eieren',

  // Gemüse
  zwiebel: 'ui',
  zwiebeln: 'uien',
  knoblauch: 'knoflook',
  moehre: 'wortel',
  moehren: 'wortelen',
  karotte: 'wortel',
  kartoffel: 'aardappel',
  kartoffeln: 'aardappelen',
  tomate: 'tomaat',
  tomaten: 'tomaten',
  paprika: 'paprika',
  gurke: 'komkommer',
  lauch: 'prei',
  sellerie: 'selderij',
  spinat: 'spinazie',
  brokkoli: 'broccoli',
  blumenkohl: 'bloemkool',
  champignons: 'champignons',
  pilze: 'champignons',
  aubergine: 'aubergine',
  zucchini: 'courgette',
  salat: 'sla',
  kuerbis: 'pompoen',
  hokkaidokuerbis: 'hokkaido pompoen',
  erbsen: 'erwten',
  bohnen: 'bonen',
  mais: 'mais',
  rucola: 'rucola',
  fenchel: 'venkel',
  rotkohl: 'rodekool',
  weisskohl: 'witte kool',
  ingwer: 'gember',

  // Kräuter
  petersilie: 'peterselie',
  basilikum: 'basilicum',
  schnittlauch: 'bieslook',
  thymian: 'tijm',
  rosmarin: 'rozemarijn',
  oregano: 'oregano',
  dill: 'dille',

  // Fleisch & Fisch
  hackfleisch: 'gehakt',
  rindfleisch: 'rundvlees',
  schweinefleisch: 'varkensvlees',
  haehnchen: 'kip',
  haehnchenbrust: 'kipfilet',
  speck: 'spek',
  schinken: 'ham',
  lachs: 'zalm',
  thunfisch: 'tonijn',
  garnelen: 'garnalen',

  // Sonstiges
  oel: 'olie',
  olivenoel: 'olijfolie',
  sonnenblumenoel: 'zonnebloemolie',
  essig: 'azijn',
  senf: 'mosterd',
  honig: 'honing',
  tomatenmark: 'tomatenpuree',
  bruehe: 'bouillon',
  gemuesebruehe: 'groentebouillon',
  wein: 'wijn',
  zitrone: 'citroen',
  apfel: 'appel',
  banane: 'banaan',
  brot: 'brood',
  schokolade: 'chocolade',
  nuesse: 'noten',
  mandeln: 'amandelen',
};

/**
 * Zutaten, die man üblicherweise zu Hause hat.
 * Sie landen standardmäßig nicht auf der Einkaufsliste — der Nutzer kann
 * das pro Zutat überstimmen.
 */
const PANTRY_STAPLES = new Set([
  'salz',
  'pfeffer',
  'zucker',
  'oel',
  'olivenoel',
  'sonnenblumenoel',
  'essig',
  'mehl',
  'wasser',
  'backpulver',
]);

/** Normalisiert einen Zutatennamen zu einem Nachschlage-Schlüssel. */
export function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, '_');
}

/**
 * Liefert den niederländischen Suchbegriff für eine deutsche Zutat.
 * Fällt auf den Originalnamen zurück, wenn nichts hinterlegt ist.
 */
export function toDutchSearchTerm(germanName: string): string {
  const key = normalizeKey(germanName);
  if (DE_TO_NL[key]) return DE_TO_NL[key];

  // Getrennte Begriffe: letztes Wort ist im Deutschen meist das Grundwort
  // ("Bio-Vollmilch" → "milch").
  const lastWord = key.split(/[_-]/).at(-1);
  if (lastWord && DE_TO_NL[lastWord]) return DE_TO_NL[lastWord];

  // Zusammengeschriebene Komposita — der eigentliche Normalfall im
  // Deutschen. „Hühnerbrühe" ist eine Brühe, „Kartoffelsalat" ein Salat:
  // Das Grundwort steht hinten und klebt am Bestimmungswort.
  //
  // Der längste passende Eintrag gewinnt, damit „vollmilch" nicht an „milch"
  // hängen bleibt, wenn es beides gäbe. Mindestens vier Zeichen, sonst
  // trifft „ei" auf jedes Wort, das zufällig darauf endet — „Petersilei"
  // wäre kein Ei.
  const suffix = longestMatch(key, (k) => key.endsWith(k));
  if (suffix) return DE_TO_NL[suffix];

  // Andersherum: Chefkoch schreibt die Einheit gern in den Namen
  // („Knoblauchzehe", „Selleriestange"). Dann steht die Zutat vorne.
  const prefix = longestMatch(key, (k) => key.startsWith(k));
  if (prefix) return DE_TO_NL[prefix];

  return germanName.trim();
}

/** Längster Wörterbuchschlüssel ab vier Zeichen, der die Bedingung erfüllt. */
function longestMatch(key: string, passt: (k: string) => boolean): string | undefined {
  let best: string | undefined;
  for (const k of Object.keys(DE_TO_NL)) {
    if (k.length < 4 || k.length >= key.length || !passt(k)) continue;
    if (!best || k.length > best.length) best = k;
  }
  return best;
}

/**
 * Frischt einen gespeicherten Suchbegriff auf, wenn er nie einer war.
 *
 * Importierte Rezepte speichern `searchTermNl` zum Zeitpunkt des Imports.
 * Wächst das Wörterbuch später, erreicht die Korrektur diese Rezepte nicht —
 * „Schmand" blieb „Schmand", obwohl es inzwischen „creme fraiche" ergäbe.
 *
 * Ist der gespeicherte Begriff mit dem deutschen Namen identisch, hat die
 * Übersetzung damals **nicht** gegriffen. Nur dann wird neu nachgeschlagen;
 * ein echter niederländischer Begriff bleibt unangetastet, und ein vom
 * Nutzer von Hand gesetzter erst recht.
 */
export function refreshSearchTerm(germanName: string, stored: string | undefined): string {
  const term = stored?.trim();
  if (!term) return toDutchSearchTerm(germanName);
  if (normalizeKey(term) === normalizeKey(germanName)) return toDutchSearchTerm(germanName);
  return term;
}

export function isPantryStaple(germanName: string): boolean {
  return PANTRY_STAPLES.has(normalizeKey(germanName));
}

/** Anzahl hinterlegter Zutaten — die UI weist auf die Grenzen der Tabelle hin. */
export const DICTIONARY_SIZE = Object.keys(DE_TO_NL).length;
