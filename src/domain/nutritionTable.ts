/**
 * Durchschnittliche Nährwerte je 100 g/ml — der Rückfall.
 *
 * Albert Heijn liefert Nährwerte nur, wenn der Hersteller sie gemeldet hat.
 * Bei loser Frischware und Backtheke ist das der Normalfall nicht: Für eine
 * Gurke, ein Bund Petersilie oder ein Stück Pecorino steht dort nichts.
 * Ohne diese Tabelle fiel jede solche Zutat aus der Rechnung — und zog die
 * Kalorienangabe nach unten.
 *
 * ⚠️ **Das sind Durchschnittswerte, keine Produktangaben.** Eine Zutat, die
 * hier statt beim Händler nachgeschlagen wurde, wird im Ergebnis als
 * `estimated` markiert und in der Oberfläche als geschätzt gekennzeichnet.
 * Der Unterschied ist wichtig: Herstellerangaben sind für *ihr* Produkt
 * verbindlich, diese Werte gelten für „so etwas in der Art". Bei Gemüse ist
 * das unkritisch, bei Käse und Wurst streuen die echten Werte deutlich.
 *
 * Die Werte stammen aus den üblichen Nährwerttabellen (Größenordnung
 * Souci-Fachmann-Kraut / USDA) und sind bewusst auf eine Nachkommastelle
 * gerundet — eine dritte Stelle würde eine Genauigkeit vortäuschen, die ein
 * Durchschnittswert nicht hat.
 *
 * Gepflegt wie das Übersetzungswörterbuch: Sie wächst mit den Rezepten, die
 * tatsächlich auftreten. Schlüssel sind normalisierte deutsche Namen.
 */

import { normalizeKey } from './translate';
import type { Nutrition } from '../supermarkets/types';

/** Kurzform: kcal, Fett, gesättigt, Kohlenhydrate, Zucker, Eiweiß, Salz. */
type Row = [
  kcal: number,
  fat: number,
  saturatedFat: number,
  carbs: number,
  sugar: number,
  protein: number,
  salt: number,
];

/** Werte je 100 g, außer bei Flüssigem — dort je 100 ml (siehe `VOLUME_KEYS`). */
const TABLE: Record<string, Row> = {
  // ── Gemüse ────────────────────────────────────────────────────────
  zwiebel: [40, 0.1, 0, 9.3, 4.2, 1.1, 0],
  schalotte: [72, 0.1, 0, 16.8, 7.9, 2.5, 0],
  fruehlingszwiebel: [32, 0.2, 0, 7.3, 2.3, 1.8, 0],
  knoblauch: [149, 0.5, 0.1, 33.1, 1, 6.4, 0],
  knoblauchzehe: [149, 0.5, 0.1, 33.1, 1, 6.4, 0],
  moehre: [41, 0.2, 0, 9.6, 4.7, 0.9, 0.1],
  karotte: [41, 0.2, 0, 9.6, 4.7, 0.9, 0.1],
  kartoffel: [77, 0.1, 0, 17.5, 0.8, 2, 0],
  tomate: [18, 0.2, 0, 3.9, 2.6, 0.9, 0],
  gurke: [15, 0.1, 0, 3.6, 1.7, 0.7, 0],
  paprika: [31, 0.3, 0.1, 6, 4.2, 1, 0],
  zucchini: [17, 0.3, 0.1, 3.1, 2.5, 1.2, 0],
  aubergine: [25, 0.2, 0, 5.9, 3.5, 1, 0],
  lauch: [61, 0.3, 0, 14.2, 3.9, 1.5, 0.1],
  sellerie: [16, 0.2, 0, 3, 1.3, 0.7, 0.2],
  fenchel: [31, 0.2, 0, 7.3, 3.9, 1.2, 0.1],
  champignons: [22, 0.3, 0, 3.3, 2, 3.1, 0],
  pilze: [22, 0.3, 0, 3.3, 2, 3.1, 0],
  spinat: [23, 0.4, 0.1, 3.6, 0.4, 2.9, 0.2],
  brokkoli: [34, 0.4, 0, 6.6, 1.7, 2.8, 0.1],
  blumenkohl: [25, 0.3, 0.1, 5, 1.9, 1.9, 0.1],
  rotkohl: [31, 0.2, 0, 7.4, 3.8, 1.4, 0],
  weisskohl: [25, 0.1, 0, 5.8, 3.2, 1.3, 0],
  erbsen: [81, 0.4, 0.1, 14.5, 5.7, 5.4, 0],
  bohnen: [31, 0.1, 0, 7, 3.3, 1.8, 0],
  mais: [86, 1.2, 0.2, 19, 3.2, 3.3, 0],
  kuerbis: [26, 0.1, 0, 6.5, 2.8, 1, 0],
  salat: [15, 0.2, 0, 2.9, 0.8, 1.4, 0],
  rucola: [25, 0.7, 0.1, 3.7, 2.1, 2.6, 0],
  ingwer: [80, 0.8, 0.2, 17.8, 1.7, 1.8, 0],

  // ── Kräuter ───────────────────────────────────────────────────────
  petersilie: [36, 0.8, 0.1, 6.3, 0.9, 3, 0.1],
  basilikum: [23, 0.6, 0, 2.7, 0.3, 3.2, 0],
  schnittlauch: [30, 0.7, 0.1, 4.4, 1.9, 3.3, 0],
  dill: [43, 1.1, 0.1, 7, 0, 3.5, 0.1],
  thymian: [101, 1.7, 0.5, 24.5, 0, 5.6, 0],
  rosmarin: [131, 5.9, 2.8, 20.7, 0, 3.3, 0],
  oregano: [265, 4.3, 1.6, 68.9, 4.1, 9, 0.1],
  minze: [44, 0.7, 0.2, 8.4, 0, 3.3, 0],
  koriander: [23, 0.5, 0, 3.7, 0.9, 2.1, 0.1],

  // ── Fleisch und Fisch ─────────────────────────────────────────────
  hackfleisch: [241, 17, 6.9, 0, 0, 21, 0.2],
  rindfleisch: [187, 10, 4.2, 0, 0, 24, 0.2],
  schweinefleisch: [242, 14, 5.2, 0, 0, 27, 0.2],
  haehnchen: [165, 3.6, 1, 0, 0, 31, 0.2],
  haehnchenbrust: [165, 3.6, 1, 0, 0, 31, 0.2],
  speck: [393, 37, 13.7, 1.4, 0, 13, 4.5],
  schinken: [145, 5.5, 1.9, 1.5, 1, 21, 3.2],
  lachs: [208, 13, 3.1, 0, 0, 20, 0.1],
  thunfisch: [132, 1.3, 0.4, 0, 0, 28, 0.3],
  garnelen: [99, 0.3, 0.1, 0.2, 0, 24, 0.6],

  // ── Milchprodukte und Eier ────────────────────────────────────────
  milch: [46, 1.5, 1, 4.8, 4.8, 3.5, 0.1],
  sahne: [292, 30, 19, 3.4, 3.3, 2.4, 0.1],
  schlagsahne: [292, 30, 19, 3.4, 3.3, 2.4, 0.1],
  saure_sahne: [193, 19, 12, 3.6, 3.4, 2.8, 0.1],
  schmand: [237, 24, 15, 3.2, 3, 2.6, 0.1],
  creme_fraiche: [292, 30, 20, 2.8, 2.8, 2.4, 0.1],
  quark: [67, 0.2, 0.1, 4.1, 4.1, 12, 0.1],
  joghurt: [61, 3.3, 2.1, 4.7, 4.7, 3.5, 0.1],
  butter: [741, 82, 51, 0.6, 0.6, 0.7, 1.2],
  margarine: [717, 80, 20, 0.7, 0.7, 0.2, 1.5],
  kaese: [356, 28, 18, 1.3, 0.5, 25, 1.7],
  frischkaese: [253, 24, 15, 3.5, 3.2, 6, 0.7],
  parmesan: [402, 29, 19, 3.2, 0.8, 33, 1.6],
  pecorino: [387, 30, 20, 1, 0.8, 26, 1.8],
  mozzarella: [254, 19, 12, 2.2, 1, 18, 1.2],
  gouda: [356, 27, 18, 2.2, 2.2, 25, 1.8],
  feta: [264, 21, 15, 4.1, 4.1, 14, 3,],
  ei: [143, 9.5, 3.1, 0.7, 0.4, 13, 0.4],
  eier: [143, 9.5, 3.1, 0.7, 0.4, 13, 0.4],

  // ── Trockenware und Backen ────────────────────────────────────────
  mehl: [341, 1, 0.2, 72, 0.7, 10, 0],
  weizenmehl: [341, 1, 0.2, 72, 0.7, 10, 0],
  dinkelmehl: [338, 2.4, 0.4, 66, 2.6, 12, 0],
  zucker: [400, 0, 0, 100, 100, 0, 0],
  haferflocken: [372, 7, 1.3, 59, 1.2, 13, 0],
  reis: [349, 0.6, 0.2, 78, 0.2, 7, 0],
  nudeln: [359, 1.5, 0.3, 72, 3.5, 12, 0],
  nudel: [359, 1.5, 0.3, 72, 3.5, 12, 0],
  spaghetti: [359, 1.5, 0.3, 72, 3.5, 12, 0],
  gnocchi: [156, 0.6, 0.1, 33, 0.9, 3.4, 0.9],
  couscous: [376, 0.6, 0.1, 77, 0.2, 13, 0],
  linsen: [327, 1.6, 0.3, 49, 1.8, 24, 0],
  kichererbsen: [364, 6, 0.6, 61, 11, 19, 0],
  brot: [265, 3.2, 0.7, 49, 4.3, 9, 1.2],
  broetchen: [279, 2.8, 0.6, 53, 3.5, 9.4, 1.2],
  blaetterteig: [389, 26, 13, 34, 1.1, 5.2, 1.1],
  semmelbroesel: [395, 5.3, 1.2, 72, 6.2, 13, 1.5],

  // ── Öl, Sauce, Sonstiges ──────────────────────────────────────────
  oel: [884, 100, 15, 0, 0, 0, 0],
  olivenoel: [884, 100, 14, 0, 0, 0, 0],
  sonnenblumenoel: [884, 100, 11, 0, 0, 0, 0],
  essig: [21, 0, 0, 0.9, 0.4, 0, 0],
  senf: [66, 3.3, 0.2, 5.8, 2.9, 4.4, 3.3],
  honig: [304, 0, 0, 82, 82, 0.3, 0],
  tomatenmark: [82, 0.5, 0.1, 19, 12, 4.3, 0.1],
  bruehe: [4, 0.2, 0, 0.4, 0.2, 0.2, 1.1],
  gemuesebruehe: [4, 0.2, 0, 0.4, 0.2, 0.2, 1.1],
  huehnerbruehe: [6, 0.3, 0.1, 0.4, 0.2, 0.4, 1.1],
  wein: [83, 0, 0, 2.6, 0.6, 0.1, 0],
  zitrone: [29, 0.3, 0, 9.3, 2.5, 1.1, 0],
  apfel: [52, 0.2, 0, 14, 10, 0.3, 0],
  banane: [89, 0.3, 0.1, 23, 12, 1.1, 0],
  schokolade: [546, 31, 19, 61, 48, 4.9, 0.1],
  nuesse: [607, 54, 5.2, 20, 4.4, 20, 0],
  mandeln: [579, 50, 3.8, 22, 4.4, 21, 0],
  salz: [0, 0, 0, 0, 0, 0, 100],
  pfeffer: [251, 3.3, 1.4, 64, 0.6, 10, 0.1],
  paprikapulver: [282, 13, 2.1, 54, 10, 14, 0.1],
  zimt: [247, 1.2, 0.3, 81, 2.2, 4, 0],
  muskat: [525, 36, 26, 49, 28, 5.8, 0.1],
};

/** Zutaten, deren Werte sich auf 100 ml statt 100 g beziehen. */
const VOLUME_KEYS = new Set(['milch', 'sahne', 'schlagsahne', 'oel', 'olivenoel', 'sonnenblumenoel', 'essig', 'wein', 'bruehe', 'gemuesebruehe', 'huehnerbruehe']);

/**
 * Durchschnittswerte für eine Zutat, oder `null` wenn nichts hinterlegt ist.
 *
 * Nachgeschlagen wird nach demselben Verfahren wie im Übersetzungswörterbuch:
 * erst der ganze Name, dann das letzte Wort, dann das Grundwort eines
 * zusammengeschriebenen Kompositums. „Bio-Vollmilch" findet so `milch`,
 * „Hühnerbrühe" findet `huehnerbruehe`.
 */
export function averageNutrition(germanName: string): Nutrition | null {
  const key = normalizeKey(germanName);
  const row = TABLE[key] ? { key, value: TABLE[key] } : lookupCompound(key);
  if (!row) return null;

  const [kcal, fat, saturatedFat, carbs, sugar, protein, salt] = row.value;
  return {
    basis: VOLUME_KEYS.has(row.key) ? 'ml' : 'g',
    kcal,
    fat,
    saturatedFat,
    carbs,
    sugar,
    protein,
    salt,
  };
}

function lookupCompound(key: string): { key: string; value: Row } | null {
  const lastWord = key.split(/[_-]/).at(-1);
  if (lastWord && TABLE[lastWord]) return { key: lastWord, value: TABLE[lastWord] };

  // Zusammengeschriebenes Kompositum: Grundwort hinten, mindestens vier
  // Zeichen — sonst trifft „ei" auf jedes Wort, das zufällig darauf endet.
  let best: string | undefined;
  for (const k of Object.keys(TABLE)) {
    if (k.length < 4 || k.length >= key.length) continue;
    if (!key.endsWith(k) && !key.startsWith(k)) continue;
    if (!best || k.length > best.length) best = k;
  }
  return best ? { key: best, value: TABLE[best] } : null;
}

/** Anzahl hinterlegter Zutaten — die Oberfläche weist auf die Grenzen hin. */
export const NUTRITION_TABLE_SIZE = Object.keys(TABLE).length;

/** Nur für Tests und Prüfskripte. */
export const NUTRITION_TABLE = TABLE;
