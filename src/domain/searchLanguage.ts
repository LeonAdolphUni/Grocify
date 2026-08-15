/**
 * Suchbegriffe in die Sprache des Rezeptportals übersetzen.
 *
 * Allerhande ist niederländisch. Wer „Eiersalat" eingibt, sucht dort nach
 * einem Wort, das es nicht gibt — und bekommt nichts, obwohl AH
 * „eiersalade" führt. Das ist kein Randfall: Es ist der Normalfall für
 * jeden, der nicht auf Niederländisch denkt.
 *
 * Übersetzt wird in drei Stufen, von genau nach grob:
 *
 *   1. **Ganzer Begriff.** „Eiersalat" steht als Ganzes in der Tabelle.
 *   2. **Wort für Wort.** „Suppe mit Huhn" wird zu „soep met kip".
 *   3. **Endungsregeln.** „-salat" wird zu „-salade", „-suppe" zu „-soep".
 *      Deutsch und Niederländisch sind nah verwandt; diese Regeln fangen
 *      ab, was in keiner Tabelle steht.
 *
 * Was danach übrig bleibt, geht unverändert durch — bei international
 * gleichen Wörtern (Pasta, Pizza, Curry) trifft das ohnehin.
 *
 * ⚠️ **Keine allgemeine Übersetzung.** Diese Tabellen kennen Essen, sonst
 * nichts. Das ist Absicht: Ein Wörterbuch, das alles kann, kann nichts
 * davon gut, und die Suche braucht nur Lebensmittel.
 */

export type SearchLanguage = 'de' | 'nl' | 'en';

export const SEARCH_LANGUAGES: { id: SearchLanguage; label: string; hint: string }[] = [
  { id: 'de', label: 'Deutsch', hint: 'Eiersalat, Hähnchen, Kürbissuppe' },
  { id: 'nl', label: 'Nederlands', hint: 'eiersalade, kip, pompoensoep' },
  { id: 'en', label: 'English', hint: 'egg salad, chicken, pumpkin soup' },
];

/** Deutsch → Niederländisch, für die Rezeptsuche. */
const DE_NL: Record<string, string> = {
  // Gerichtsarten
  salat: 'salade',
  eiersalat: 'eiersalade',
  kartoffelsalat: 'aardappelsalade',
  nudelsalat: 'pastasalade',
  suppe: 'soep',
  eintopf: 'stoofpot',
  auflauf: 'ovenschotel',
  gratin: 'gratin',
  pfanne: 'pan',
  pfannkuchen: 'pannenkoeken',
  braten: 'braadstuk',
  brot: 'brood',
  kuchen: 'taart',
  torte: 'taart',
  nachtisch: 'nagerecht',
  vorspeise: 'voorgerecht',
  hauptgericht: 'hoofdgerecht',
  frühstück: 'ontbijt',
  fruehstueck: 'ontbijt',
  mittagessen: 'lunch',
  abendessen: 'avondeten',

  // Fleisch und Fisch
  huhn: 'kip',
  hähnchen: 'kip',
  haehnchen: 'kip',
  hühnchen: 'kip',
  hackfleisch: 'gehakt',
  hack: 'gehakt',
  rind: 'rundvlees',
  rindfleisch: 'rundvlees',
  schwein: 'varkensvlees',
  schweinefleisch: 'varkensvlees',
  fleisch: 'vlees',
  speck: 'spek',
  schinken: 'ham',
  wurst: 'worst',
  fisch: 'vis',
  lachs: 'zalm',
  thunfisch: 'tonijn',
  garnelen: 'garnalen',

  // Gemüse
  gemüse: 'groente',
  gemuese: 'groente',
  kartoffel: 'aardappel',
  kartoffeln: 'aardappelen',
  zwiebel: 'ui',
  knoblauch: 'knoflook',
  tomate: 'tomaat',
  tomaten: 'tomaten',
  gurke: 'komkommer',
  paprika: 'paprika',
  kürbis: 'pompoen',
  kuerbis: 'pompoen',
  zucchini: 'courgette',
  aubergine: 'aubergine',
  brokkoli: 'broccoli',
  blumenkohl: 'bloemkool',
  spinat: 'spinazie',
  pilze: 'champignons',
  champignons: 'champignons',
  möhren: 'wortelen',
  moehren: 'wortelen',
  karotten: 'wortelen',
  lauch: 'prei',
  bohnen: 'bonen',
  erbsen: 'erwten',
  linsen: 'linzen',
  kichererbsen: 'kikkererwten',

  // Molkerei
  käse: 'kaas',
  kaese: 'kaas',
  ei: 'ei',
  eier: 'eieren',
  milch: 'melk',
  sahne: 'room',
  joghurt: 'yoghurt',
  quark: 'kwark',

  // Grundnahrungsmittel
  nudeln: 'pasta',
  nudel: 'pasta',
  reis: 'rijst',
  mehl: 'bloem',

  // Eigenschaften
  vegetarisch: 'vegetarisch',
  vegan: 'veganistisch',
  gesund: 'gezond',
  schnell: 'snel',
  einfach: 'makkelijk',
  günstig: 'goedkoop',
  guenstig: 'goedkoop',
  billig: 'goedkoop',
  scharf: 'pittig',
  cremig: 'romig',
  ofen: 'oven',
  gebacken: 'gebakken',
  gegrillt: 'gegrild',
  italienisch: 'italiaans',
  asiatisch: 'aziatisch',
  mexikanisch: 'mexicaans',
  griechisch: 'grieks',
  spanisch: 'spaans',
  indisch: 'indiaas',
};

/** Englisch → Niederländisch. */
const EN_NL: Record<string, string> = {
  salad: 'salade',
  'egg salad': 'eiersalade',
  'potato salad': 'aardappelsalade',
  soup: 'soep',
  stew: 'stoofpot',
  casserole: 'ovenschotel',
  pancakes: 'pannenkoeken',
  bread: 'brood',
  cake: 'taart',
  breakfast: 'ontbijt',
  lunch: 'lunch',
  dinner: 'avondeten',
  dessert: 'nagerecht',

  chicken: 'kip',
  beef: 'rundvlees',
  pork: 'varkensvlees',
  meat: 'vlees',
  mince: 'gehakt',
  bacon: 'spek',
  ham: 'ham',
  sausage: 'worst',
  fish: 'vis',
  salmon: 'zalm',
  tuna: 'tonijn',
  shrimp: 'garnalen',
  prawns: 'garnalen',

  vegetables: 'groente',
  vegetable: 'groente',
  potato: 'aardappel',
  potatoes: 'aardappelen',
  onion: 'ui',
  garlic: 'knoflook',
  tomato: 'tomaat',
  tomatoes: 'tomaten',
  cucumber: 'komkommer',
  pepper: 'paprika',
  pumpkin: 'pompoen',
  courgette: 'courgette',
  zucchini: 'courgette',
  eggplant: 'aubergine',
  broccoli: 'broccoli',
  cauliflower: 'bloemkool',
  spinach: 'spinazie',
  mushrooms: 'champignons',
  carrots: 'wortelen',
  leek: 'prei',
  beans: 'bonen',
  peas: 'erwten',
  lentils: 'linzen',
  chickpeas: 'kikkererwten',

  cheese: 'kaas',
  egg: 'ei',
  eggs: 'eieren',
  milk: 'melk',
  cream: 'room',
  yogurt: 'yoghurt',
  yoghurt: 'yoghurt',

  pasta: 'pasta',
  noodles: 'pasta',
  rice: 'rijst',
  flour: 'bloem',

  vegetarian: 'vegetarisch',
  vegan: 'veganistisch',
  healthy: 'gezond',
  quick: 'snel',
  easy: 'makkelijk',
  cheap: 'goedkoop',
  spicy: 'pittig',
  creamy: 'romig',
  oven: 'oven',
  baked: 'gebakken',
  grilled: 'gegrild',
  italian: 'italiaans',
  asian: 'aziatisch',
  mexican: 'mexicaans',
  greek: 'grieks',
  indian: 'indiaas',
};

/**
 * Endungsregeln für deutsche Wörter, die in keiner Tabelle stehen.
 *
 * Deutsch und Niederländisch sind nah verwandt: Was auf „-salat" endet, endet
 * drüben auf „-salade". Damit funktioniert auch „Krabbensalat", ohne dass
 * jemand das Wort eingetragen hat.
 *
 * Reihenfolge zählt — die längere Endung muss zuerst geprüft werden.
 */
const DE_ENDUNGEN: [suffix: string, ersatz: string][] = [
  ['salat', 'salade'],
  ['suppe', 'soep'],
  ['auflauf', 'ovenschotel'],
  ['pfanne', 'pan'],
  ['kuchen', 'taart'],
  ['brot', 'brood'],
  ['creme', 'creme'],
  ['soße', 'saus'],
  ['sosse', 'saus'],
  ['sauce', 'saus'],
];

/** Kleinschreiben, Umlaute behalten — die Tabellen kennen beide Formen. */
function norm(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Übersetzt einen Suchbegriff in die Sprache des Rezeptportals.
 *
 * Bei `nl` passiert nichts — der Nutzer tippt bereits Niederländisch.
 */
export function translateSearchQuery(query: string, from: SearchLanguage): string {
  const q = norm(query);
  if (!q) return '';
  if (from === 'nl') return query.trim();

  const tabelle = from === 'de' ? DE_NL : EN_NL;

  // 1. Der ganze Begriff.
  const ganz = tabelle[q];
  if (ganz) return ganz;

  // 2. Wort für Wort.
  const woerter = q.split(/\s+/);
  const uebersetzt = woerter.map((w) => translateWord(w, from, tabelle));

  // Hat sich überhaupt etwas geändert? Wenn nicht, den Originalbegriff
  // zurückgeben — er könnte international gleich sein.
  const ergebnis = uebersetzt.join(' ').trim();
  return ergebnis || query.trim();
}

function translateWord(
  wort: string,
  from: SearchLanguage,
  tabelle: Record<string, string>,
): string {
  const w = norm(wort);
  if (!w) return '';

  const direkt = tabelle[w];
  if (direkt) return direkt;

  // Deutsche Endungsregeln — nur für Deutsch, das Englische ist zu weit weg.
  if (from === 'de') {
    for (const [suffix, ersatz] of DE_ENDUNGEN) {
      if (w.length > suffix.length + 1 && w.endsWith(suffix)) {
        const stamm = w.slice(0, -suffix.length);
        // Den Stamm selbst auch übersetzen, wenn er bekannt ist:
        // „Kürbissuppe" → „pompoen" + „soep".
        const stammNl = tabelle[stamm] ?? tabelle[stamm.replace(/[ns]$/, '')] ?? stamm;
        return `${stammNl}${ersatz}`;
      }
    }
  }

  return w;
}

/**
 * Erklärt die Übersetzung für die Oberfläche.
 *
 * Wer „Eiersalat" tippt und „eiersalade"-Ergebnisse bekommt, soll sehen,
 * wonach tatsächlich gesucht wurde — sonst wirkt es wie Zauberei, und wenn
 * es einmal danebengeht, versteht niemand warum.
 */
export function describeTranslation(
  query: string,
  from: SearchLanguage,
): { translated: string; changed: boolean } {
  const translated = translateSearchQuery(query, from);
  return { translated, changed: norm(translated) !== norm(query) };
}
