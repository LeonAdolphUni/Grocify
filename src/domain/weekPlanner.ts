/**
 * Der Wochenplaner-Helfer.
 *
 * Du sagst, worauf du Lust hast — „Pasta, was mit Hähnchen, was Schnelles" —
 * und bekommst eine Woche vorgeschlagen. Bewertet wird nach vier Dingen, in
 * dieser Reihenfolge der Gewichtung:
 *
 *   1. **Deine Wünsche.** Ein Vorschlag, der ignoriert, worauf du Lust hast,
 *      ist keiner. Gesucht wird in Titel und Zutaten.
 *   2. **Was du schon hast.** Was der Vorrat deckt, kostet nichts mehr.
 *   3. **Überschneidung.** Gerichte, die sich Zutaten teilen, verbrauchen
 *      dieselbe Packung — das ist der eigentliche Zweck der App.
 *   4. **Gesund.** Aus den Durchschnittsnährwerten geschätzt: viel Eiweiß und
 *      Ballaststoffe gut, viel gesättigtes Fett und Salz schlecht.
 *
 * **Alles läuft ohne Netzwerk.** Die Nährwerte kommen aus der lokalen
 * Durchschnittstabelle, nicht vom Händler — ein Planer, der für acht Rezepte
 * je zehn Produktabfragen macht, wäre unbenutzbar langsam. Die echten Preise
 * kommen später, wenn aus dem Vorschlag eine Einkaufsliste wird.
 *
 * Deshalb heißt es Vorschlag und nicht Plan: Die Reihenfolge ist begründet,
 * aber sie ersetzt nicht, dass du weißt, worauf du Lust hast.
 */

import { averageNutrition } from './nutritionTable';
import { consumeFromPantry, deductFromPantry, type PantryItem } from './pantry';
import { isPantryStaple, normalizeKey } from './translate';
import type { Ingredient, Recipe } from './types';
import { toMassForIngredient } from './units';
import { WEEKDAYS, type WeekPlan, emptyWeek } from './weekPlan';

export interface PlannerOptions {
  /** Freitext: worauf hast du Lust? Leer heißt: keine Vorgabe. */
  wishes?: string;
  pantry?: PantryItem[];
  /** Wie viele Tage belegt werden sollen. */
  days?: number;
  /** Rezepte, die auf keinen Fall vorkommen sollen (z. B. gerade gekocht). */
  exclude?: string[];
}

/** Warum ein Rezept vorgeschlagen wurde — die Oberfläche zeigt es an. */
export interface PlannerReason {
  /** Kurzform für die Anzeige, z. B. „passt zu Pasta". */
  label: string;
  kind: 'wunsch' | 'vorrat' | 'ueberschneidung' | 'gesund';
}

export interface PlannerPick {
  recipe: Recipe;
  score: number;
  reasons: PlannerReason[];
  /** Geschätzte Kilokalorien je Portion, lokal gerechnet. */
  kcalPerServing: number | null;
  /** Anteil der Zutaten, die der Vorrat deckt (0…1). */
  pantryShare: number;
}

export interface PlannerResult {
  picks: PlannerPick[];
  plan: WeekPlan;
  /** Wünsche, für die kein Rezept gefunden wurde — ehrlich benannt. */
  unmatchedWishes: string[];
  /**
   * Was vom Vorrat nach der ganzen Woche noch übrig ist.
   *
   * Der eigentliche Maßstab: Ein Wochenplan, der den Schrank nicht leert,
   * hat seine Aufgabe nur halb erfüllt. Was hier steht, verdirbt womöglich.
   */
  pantryLeftover: PantryItem[];
  /** Anteil der Vorratseinträge, die die Woche vollständig aufbraucht (0…1). */
  pantryUsedShare: number;
}

/* ── Bausteine ─────────────────────────────────────────────────────── */

/**
 * Wörter, die in „worauf hast du Lust" nichts über das Essen aussagen.
 *
 * Ohne diese Liste sucht „was mit Hähnchen" nach dem ganzen Satz und findet
 * nichts — der Wunsch steckt im Wort „Hähnchen".
 */
const FUELLWOERTER = new Set([
  'was',
  'mit',
  'ohne',
  'etwas',
  'gern',
  'gerne',
  'lust',
  'auf',
  'ein',
  'eine',
  'einen',
  'der',
  'die',
  'das',
  'den',
  'dem',
  'und',
  'oder',
  'aber',
  'mal',
  'bisschen',
  'viel',
  'wenig',
  'gutes',
  'gute',
  'guter',
  'leckeres',
  'leckere',
  'gerichte',
  'gericht',
  'essen',
  'kochen',
  'woche',
]);

/**
 * Zerlegt die Freitexteingabe in einzelne Suchbegriffe.
 *
 * Erst an Satzzeichen und Bindewörtern trennen, dann jeden Teil in Wörter
 * zerlegen und die Füllwörter wegwerfen. „Pasta und was mit Hähnchen" wird
 * damit zu `['pasta', 'hähnchen']` statt zu einem Satzfragment, das nirgends
 * vorkommt.
 */
export function parseWishes(input: string): string[] {
  const teile = input.toLowerCase().split(/[,;\n]|\bund\b|\boder\b/);
  const woerter: string[] = [];

  for (const teil of teile) {
    for (const wort of teil.split(/\s+/)) {
      const sauber = wort.replace(/[^\p{L}\p{N}-]/gu, '').trim();
      if (sauber.length < 3 || FUELLWOERTER.has(sauber)) continue;
      if (!woerter.includes(sauber)) woerter.push(sauber);
    }
  }
  return woerter;
}

/** Zutaten ohne Vorratsware — nur die zählen für Überschneidung. */
function realIngredients(recipe: Recipe): Ingredient[] {
  return recipe.ingredients.filter((i) => !(i.isPantryStaple || isPantryStaple(i.name)));
}

/**
 * Oberbegriffe, die man beim Wünschen benutzt, aber nicht in Rezepten findet.
 *
 * Niemand schreibt „Pasta" in ein Rezept — dort steht Spaghetti, Nudeln oder
 * Lasagne. Ohne diese Tabelle bliebe der häufigste Wunsch überhaupt ohne
 * Treffer. Gepflegt wie das Übersetzungswörterbuch: Sie wächst mit dem, was
 * tatsächlich getippt wird.
 */
const OBERBEGRIFFE: Record<string, string[]> = {
  pasta: ['nudel', 'spaghetti', 'lasagne', 'tagliatelle', 'penne', 'gnocchi', 'makkaroni'],
  fleisch: ['hack', 'rind', 'schwein', 'haehnchen', 'huhn', 'kip', 'speck', 'schinken', 'wurst'],
  fisch: ['lachs', 'thunfisch', 'garnele', 'zander', 'kabeljau'],
  gemuese: ['moehre', 'karotte', 'paprika', 'zucchini', 'brokkoli', 'blumenkohl', 'spinat', 'lauch'],
  vegetarisch: ['gemuese', 'kaese', 'ei', 'linsen', 'bohnen', 'tofu'],
  suppe: ['suppe', 'bruehe', 'eintopf'],
  salat: ['salat', 'gurke', 'tomate', 'rucola'],
  kartoffel: ['kartoffel', 'gratin', 'pommes'],
  reis: ['reis', 'risotto'],
  asiatisch: ['reis', 'curry', 'wok', 'sojasauce', 'ingwer'],
  italienisch: ['pasta', 'spaghetti', 'lasagne', 'mozzarella', 'parmesan', 'pizza'],
  schnell: ['omelett', 'pfanne', 'salat', 'brot'],
  leicht: ['salat', 'suppe', 'gemuese', 'fisch'],
  deftig: ['hack', 'kartoffel', 'kaese', 'speck'],
};

/**
 * Passt ein Rezept zu einem Wunsch?
 *
 * Gesucht wird im Titel und in den Zutatennamen. „Hähnchen" findet damit
 * auch ein Rezept, das „Geschnetzeltes" heißt — der Wunsch bezieht sich auf
 * das, was drin ist, nicht nur auf den Namen.
 */
export function matchesWish(recipe: Recipe, wish: string): boolean {
  const w = normalizeKey(wish);
  if (w.length < 3) return false;

  const felder = [normalizeKey(recipe.title), ...recipe.ingredients.map((i) => normalizeKey(i.name))];
  if (felder.some((f) => f.includes(w))) return true;

  // Oberbegriff: „Pasta" steht in keinem Rezept, „Spaghetti" schon.
  const synonyme = OBERBEGRIFFE[w];
  return synonyme ? felder.some((f) => synonyme.some((syn) => f.includes(syn))) : false;
}

/**
 * Grobe Nährwertschätzung je Portion — ohne Netzwerk.
 *
 * Nutzt ausschließlich die Durchschnittstabelle. Für einen Vergleich
 * zwischen Rezepten reicht das: Ob ein Gericht 400 oder 900 kcal hat, ist
 * die Frage, nicht ob es 412 oder 418 sind.
 */
export function estimateNutrition(recipe: Recipe): {
  kcal: number | null;
  protein: number;
  saturatedFat: number;
  salt: number;
  fiber: number;
  covered: number;
} {
  let kcal = 0;
  let protein = 0;
  let saturatedFat = 0;
  let salt = 0;
  let fiber = 0;
  let covered = 0;

  for (const ing of recipe.ingredients) {
    const base = toMassForIngredient(ing.quantity, ing.id || normalizeKey(ing.name));
    if (!base || base.dimension === 'count') continue;

    const n = averageNutrition(ing.name);
    if (!n) continue;

    const passt =
      (n.basis === 'g' && base.dimension === 'mass') ||
      (n.basis === 'ml' && base.dimension === 'volume');
    if (!passt) continue;

    const f = base.amount / 100;
    kcal += (n.kcal ?? 0) * f;
    protein += (n.protein ?? 0) * f;
    saturatedFat += (n.saturatedFat ?? 0) * f;
    salt += (n.salt ?? 0) * f;
    fiber += (n.fiber ?? 0) * f;
    covered++;
  }

  const portionen = Math.max(1, recipe.servings);
  return {
    kcal: covered > 0 ? Math.round(kcal / portionen) : null,
    protein: protein / portionen,
    saturatedFat: saturatedFat / portionen,
    salt: salt / portionen,
    fiber: fiber / portionen,
    covered,
  };
}

/**
 * Gesundheitsnote von 0 bis 1.
 *
 * Bewusst simpel und benennbar statt einer Formel, die niemand nachvollzieht:
 * Eiweiß und Ballaststoffe zählen positiv, gesättigtes Fett und Salz negativ,
 * und eine Portion über 900 kcal bekommt Abzug. Das ist keine
 * Ernährungsberatung — es ist eine Reihenfolge, die besser ist als keine.
 */
export function healthScore(recipe: Recipe): number | null {
  const n = estimateNutrition(recipe);
  if (n.kcal === null || n.covered < 2) return null;

  let score = 0.5;
  if (n.protein >= 20) score += 0.2;
  else if (n.protein >= 12) score += 0.1;
  if (n.fiber >= 6) score += 0.1;

  if (n.saturatedFat >= 15) score -= 0.2;
  else if (n.saturatedFat >= 9) score -= 0.1;
  if (n.salt >= 4) score -= 0.15;
  else if (n.salt >= 2.5) score -= 0.05;
  if (n.kcal > 900) score -= 0.15;
  else if (n.kcal < 250) score -= 0.05; // zu wenig ist auch keine Mahlzeit

  return Math.max(0, Math.min(1, score));
}

/** Anteil der Zutaten, die der Vorrat deckt. */
export function pantryCoverage(recipe: Recipe, pantry: PantryItem[]): number {
  const zutaten = realIngredients(recipe);
  if (zutaten.length === 0 || pantry.length === 0) return 0;

  const gedeckt = zutaten.filter((i) => deductFromPantry(i, pantry).covered > 0).length;
  return gedeckt / zutaten.length;
}

/* ── Der Planer ────────────────────────────────────────────────────── */

const GEWICHT = {
  wunsch: 3.0,
  /**
   * Der Vorrat wiegt schwer — schwerer als Überschneidung und Nährwerte.
   *
   * Was im Schrank steht, ist schon bezahlt und verdirbt womöglich. Es zu
   * verbrauchen spart mehr, als eine Packung über zwei Gerichte zu strecken.
   */
  vorrat: 2.2,
  ueberschneidung: 1.4,
  gesund: 1.0,
  /** Zusatzpunkte, wenn ein Gericht einen Eintrag **restlos** aufbraucht. */
  aufbrauchen: 0.8,
} as const;

/**
 * Stellt eine Woche zusammen.
 *
 * Gierig, Gericht für Gericht: Das erste ist das, was am besten zu deinen
 * Wünschen passt und am meisten aus dem Vorrat deckt. Jedes weitere wird
 * zusätzlich danach bewertet, wie viele Zutaten es mit dem bisher Gewählten
 * teilt — deshalb ändert sich die Rangfolge nach jeder Wahl.
 */
export function planWeek(recipes: Recipe[], options: PlannerOptions = {}): PlannerResult {
  const { wishes = '', pantry = [], days = 7, exclude = [] } = options;

  const wunschliste = parseWishes(wishes);
  const ausgeschlossen = new Set(exclude);
  const offen = recipes.filter((r) => !ausgeschlossen.has(r.id));

  const picks: PlannerPick[] = [];
  const imKorb = new Set<string>();
  const getroffeneWuensche = new Set<string>();

  /**
   * Der Vorrat schrumpft mit jeder Wahl.
   *
   * Ohne das bekämen alle Gerichte der Woche Punkte für dieselben zwei
   * Zwiebeln — der Planer würde behaupten, der Vorrat sei mehrfach gedeckt,
   * und am Ende läge trotzdem alles im Schrank.
   */
  let verbleibend = pantry;

  while (picks.length < days && offen.length > 0) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    let bestReasons: PlannerReason[] = [];

    offen.forEach((recipe, i) => {
      const reasons: PlannerReason[] = [];
      let score = 0;

      // 1. Wünsche — der stärkste Hebel.
      const treffer = wunschliste.filter((w) => matchesWish(recipe, w));
      if (treffer.length > 0) {
        score += GEWICHT.wunsch * Math.min(1, treffer.length / Math.max(1, wunschliste.length));
        reasons.push({ kind: 'wunsch', label: `passt zu „${treffer[0]}"` });
      }

      // 2. Vorrat — gegen den *verbleibenden*, nicht den ursprünglichen.
      const vorratsanteil = pantryCoverage(recipe, verbleibend);
      if (vorratsanteil > 0) {
        score += GEWICHT.vorrat * vorratsanteil;
        reasons.push({
          kind: 'vorrat',
          label: `${Math.round(vorratsanteil * 100)} % aus dem Vorrat`,
        });

        // Restlos aufbrauchen ist mehr wert als anknabbern: Ein halb
        // geöffneter Rest bleibt liegen und verdirbt.
        const danach = consumeFromPantry(verbleibend, realIngredients(recipe));
        const geleert = verbleibend.length - danach.length;
        if (geleert > 0) {
          score += GEWICHT.aufbrauchen * geleert;
          reasons.push({
            kind: 'vorrat',
            label: `braucht ${geleert} ${geleert === 1 ? 'Eintrag' : 'Einträge'} auf`,
          });
        }
      }

      // 3. Überschneidung mit dem bereits Gewählten.
      const zutaten = realIngredients(recipe);
      const schluessel = zutaten.map((z) => z.id || normalizeKey(z.name));
      const gemeinsam = schluessel.filter((k) => imKorb.has(k)).length;
      if (zutaten.length > 0 && gemeinsam > 0) {
        const anteil = gemeinsam / zutaten.length;
        score += GEWICHT.ueberschneidung * anteil;
        reasons.push({
          kind: 'ueberschneidung',
          label: `teilt ${gemeinsam} ${gemeinsam === 1 ? 'Zutat' : 'Zutaten'}`,
        });
      }

      // 4. Gesund.
      const gesund = healthScore(recipe);
      if (gesund !== null) {
        score += GEWICHT.gesund * gesund;
        if (gesund >= 0.7) reasons.push({ kind: 'gesund', label: 'ausgewogen' });
      }

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
        bestReasons = reasons;
      }
    });

    if (bestIndex < 0) break;

    const gewaehlt = offen.splice(bestIndex, 1)[0];
    for (const z of realIngredients(gewaehlt)) imKorb.add(z.id || normalizeKey(z.name));
    for (const w of wunschliste) if (matchesWish(gewaehlt, w)) getroffeneWuensche.add(w);

    const anteil = pantryCoverage(gewaehlt, verbleibend);
    // Erst bewerten, dann abbuchen — sonst zeigt die Zeile an, was nach ihr
    // selbst noch da ist statt was sie verbraucht hat.
    verbleibend = consumeFromPantry(verbleibend, realIngredients(gewaehlt));

    const n = estimateNutrition(gewaehlt);
    picks.push({
      recipe: gewaehlt,
      score: Math.round(bestScore * 100) / 100,
      reasons: bestReasons,
      kcalPerServing: n.kcal,
      pantryShare: anteil,
    });
  }

  // Verteilen: der Reihe nach auf die Wochentage.
  const plan = emptyWeek('week-1');
  picks.forEach((p, i) => plan.days[WEEKDAYS[i % WEEKDAYS.length]].push(p.recipe.id));

  return {
    picks,
    plan,
    unmatchedWishes: wunschliste.filter((w) => !getroffeneWuensche.has(w)),
    pantryLeftover: verbleibend,
    pantryUsedShare:
      pantry.length === 0 ? 0 : (pantry.length - verbleibend.length) / pantry.length,
  };
}
