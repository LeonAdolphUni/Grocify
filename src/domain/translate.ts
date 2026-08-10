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

/** Deutscher Zutatenname (kleingeschrieben) → niederländischer Suchbegriff. */
const DE_TO_NL: Record<string, string> = {
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
  nudeln: 'pasta',
  spaghetti: 'spaghetti',
  linsen: 'linzen',
  kichererbsen: 'kikkererwten',

  // Molkerei & Eier
  milch: 'melk',
  butter: 'roomboter',
  margarine: 'margarine',
  sahne: 'slagroom',
  schlagsahne: 'slagroom',
  saure_sahne: 'zure room',
  quark: 'kwark',
  joghurt: 'yoghurt',
  frischkaese: 'roomkaas',
  kaese: 'kaas',
  parmesan: 'parmezaanse kaas',
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

  // Zusammengesetzte Begriffe: letztes Wort ist im Deutschen meist das
  // Grundwort ("Bio-Vollmilch" → "milch"). Ein günstiger Treffer, kein Muss.
  const lastWord = key.split(/[_-]/).at(-1);
  if (lastWord && DE_TO_NL[lastWord]) return DE_TO_NL[lastWord];

  return germanName.trim();
}

export function isPantryStaple(germanName: string): boolean {
  return PANTRY_STAPLES.has(normalizeKey(germanName));
}

/** Anzahl hinterlegter Zutaten — die UI weist auf die Grenzen der Tabelle hin. */
export const DICTIONARY_SIZE = Object.keys(DE_TO_NL).length;
