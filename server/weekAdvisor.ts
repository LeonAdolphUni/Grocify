/**
 * Der Wochenplaner, der bei Albert Heijn sucht.
 *
 * Der bisherige Planer wählte aus dem eigenen Rezeptbuch. Das ist ein Kreis:
 * Man kann nur planen, was man schon hat, und wer acht Rezepte besitzt,
 * bekommt achtmal dieselbe Woche. Dieser hier durchsucht **Allerhande** — das
 * ganze Sortiment an Rezepten, deren Zutaten AH garantiert führt.
 *
 * **Gesund und günstig sind hier keine Beiwerte, sondern die Auswahlregel.**
 *
 *   Gesund  — aus AHs eigenen Nährwertangaben je Portion. Kein Schätzen:
 *             Die Zahlen stehen im JSON-LD des Rezepts.
 *   Günstig — über den **echten Preis je Portion**, bei Albert Heijn
 *             nachgeschlagen, plus die Überschneidung mit dem schon
 *             Gewählten. Wer siebenmal dieselbe Packung anbricht, zahlt
 *             sie einmal.
 *
 * **Warum jetzt echte Preise.** Bis zuletzt stand hier die Zutatenzahl als
 * Stellvertreter, mit der Begründung, echte Preise kosteten zu viele
 * Anfragen. Das war ein Denkfehler: Die Rezeptseiten liegen auf `www.ah.nl`
 * und sind gedrosselt, die Produktsuche läuft über `api.ah.nl` und ist es
 * nicht. Eine Messung zeigte, was der Stellvertreter anrichtet — ein
 * Wochenvorschlag mit 7,29 € Honig und 6,99 € Hähnchenfilet, weil beide
 * Rezepte „wenige Zutaten" hatten. Zutatenzahl misst nicht Geld.
 *
 * **Warum ein Formular und kein Gespräch.** Frühere Fassungen fragten im
 * Dialog. Beim ersten echten Durchlauf war das Ergebnis zu teuer und die
 * Verwertung schlecht — und im Chat ließ sich nicht sagen, was man
 * eigentlich will, weil die Stellschrauben (Budget, Tage, Portionen) gar
 * nicht zur Sprache kamen. Ein Formular zeigt sie alle auf einmal.
 */

import { browseCategory, importRecipe, searchRecipes, type RecipeHit } from './allerhande';
import { newId } from '../src/domain/id';
import type { PantryItem } from '../src/domain/pantry';
import { deductFromPantry } from '../src/domain/pantry';
import { scaleRecipe } from '../src/domain/portions';
import { buildShoppingList } from '../src/domain/shoppingList';
import { isPantryStaple } from '../src/domain/translate';
import { calculateStats, type Recipe } from '../src/domain/types';
import type { PriceProvider, SearchOptions, SearchResult } from '../src/supermarkets/types';

export interface AdvisorRequest {
  /** Worauf hast du Lust — schon auf Niederländisch übersetzt. */
  wishes: string[];
  /** Wie viele Gerichte gebraucht werden. */
  days: number;
  pantry: PantryItem[];
  /** Rezepte, die der Nutzer schon abgelehnt hat. */
  rejected?: string[];
  /**
   * Auf wie viele Portionen gerechnet wird. Bestimmt den Preis je Portion
   * und damit die Auswahl — bei einer Portion fällt anders aus, was
   * „günstig" heißt, als bei vieren.
   */
  servings?: number;
  /**
   * Obergrenze für den Preis je Portion, in Euro.
   *
   * `undefined` heißt „kein Limit" — dann wird der Preis nur gewichtet,
   * nicht als Ausschluss verwendet.
   */
  maxPricePerServing?: number;
  /** Nur fleischlose Gerichte vorschlagen. */
  vegetarianOnly?: boolean;
  /** Höchste Zubereitungszeit in Minuten. */
  maxMinutes?: number;
  /** Der Anbieter, bei dem die Preise geholt werden. Tests reichen einen eigenen. */
  provider?: PriceProvider;
}

export interface AdvisorPick {
  hit: RecipeHit;
  recipe: Recipe;
  score: number;
  reasons: string[];
  kcalPerServing?: number;
  proteinPerServing?: number;
  ingredientCount: number;
  pantryShare: number;
  totalMinutes?: number;
  /**
   * Was das Gericht allein gekauft kostet, je Portion.
   *
   * Bewusst „allein": Im Wochenverbund wird es billiger, weil Packungen
   * geteilt werden. Als Rangfolge ist die Einzelrechnung trotzdem richtig —
   * sie bestraft genau die Gerichte, die ein 7-€-Glas für einen Teelöffel
   * aufmachen. Der ehrliche Wochenpreis steht in `totalPrice`.
   */
  pricePerServing?: number;
  /** Anteil des Gekauften, der bei diesem Gericht wirklich verkocht wird. */
  utilization?: number;
}

export interface AdvisorResult {
  picks: AdvisorPick[];
  /** Wünsche, für die Allerhande nichts hergab. */
  unmatched: string[];
  /** Wie viele Rezeptseiten geholt wurden — für die Ehrlichkeit der Wartezeit. */
  fetched: number;
  /**
   * Was die ganze Woche zusammen kostet, mit geteilten Packungen.
   *
   * Das ist die Zahl, die der Nutzer wirklich zahlt — und sie ist kleiner
   * als die Summe der Einzelpreise. Sie hier mitzugeben erspart ihm, erst
   * die Einkaufsliste bauen zu müssen, um zu erfahren, ob der Vorschlag
   * sein Budget sprengt.
   */
  totalPrice?: number;
  /** Verwertung der ganzen Woche, 0…1. */
  totalUtilization?: number;
  /**
   * Kandidaten, die der Filter aussortiert hat, mit Grund — für die
   * Ehrlichkeit: „von 14 geprüften blieben 5" erklärt einen dünnen
   * Vorschlag besser als ein kommentarloses Ergebnis.
   */
  filtered: { title: string; reason: string }[];
  /**
   * Das Budget musste fallengelassen werden, weil sonst nichts übrig blieb.
   *
   * Muss dem Nutzer gesagt werden. Ein Vorschlag, der stillschweigend über
   * der gesetzten Grenze liegt, ist schlimmer als einer, der sie überschreitet
   * und es dazusagt.
   */
  budgetRelaxed?: boolean;
}

/**
 * Kategorien, aus denen ohne konkreten Wunsch geschöpft wird.
 *
 * Bewusst die gesunden und die einfachen: Wer nichts sagt, will nicht
 * zufällige Rezepte, sondern brauchbare. Zwei Kategorien statt einer, damit
 * die Woche nicht aus sieben Salaten besteht.
 */
const FALLBACK_KATEGORIEN = ['gezonde-recepten', 'makkelijke-recepten', 'eenpansgerechten'];

/**
 * Wie viele Rezeptseiten höchstens geholt werden.
 *
 * Jede kostet eine Anfrage und, wegen der Drosselung, eine Sekunde. Zwanzig
 * sind gut zwanzig Sekunden — lang, aber vertretbar für einen Wochenplan.
 * Mehr Kandidaten würden die Auswahl kaum verbessern und die Wartezeit
 * verdoppeln.
 */
const MAX_ABRUFE = 20;

/**
 * Portionszahl, ab der ein Rezept kein Abendessen mehr ist.
 *
 * Aus einer Messung: Der Planer schlug „Yoghurtbars" für **12 Portionen**
 * und „Gepofte-granenblokjes" für 12 vor. Auf eine Person heruntergerechnet
 * braucht man davon ein Zwölftel Glas Honig — gekauft wird das ganze Glas.
 * Genau das erzeugte die 7 % Verwertung, über die sich der Nutzer beschwert
 * hat. Ein Rezept für zwölf ist ein Partyrezept, kein Wochengericht.
 */
const MAX_PORTIONEN = 6;

/**
 * AH-Kategorien, die kein Hauptgericht sind.
 *
 * Als **Sperrliste**, nicht als Erlaubnisliste: Eine unbekannte Kategorie
 * soll durchkommen. Kennte die App nur „hoofdgerecht" und AH führte eine
 * neue Bezeichnung ein, stünde der Planer plötzlich ohne Vorschläge da —
 * ein stiller Totalausfall ist schlimmer als ein gelegentlicher Nachtisch.
 */
const KEINE_HAUPTGERICHTE = new Set([
  'bijgerecht',
  'voorgerecht',
  'nagerecht',
  'dessert',
  'snack',
  'borrelhapje',
  'borrel',
  'hapje',
  'drankje',
  'cocktail',
  'smoothie',
  'bakken',
  'gebak',
  'taart',
  'koekjes',
  'brood',
  'saus',
  'dip',
  'dressing',
  'ontbijt',
  'tussendoortje',
]);

/**
 * Fleisch und Fisch, erkannt am **Wortanfang** einer Zutat.
 *
 * Nur für den Filter „nur vegetarisch". Der Wortanfang und nicht die bloße
 * Teilzeichenkette, und das ist kein Feinschliff: „ham" steckt mitten in
 * **„champignons"**, „lam" in „balsamicoazijn" wäre der nächste Fall.
 * Teilzeichenketten hätten pilzhaltige Gerichte als Fleisch aussortiert —
 * lautlos, denn der Nutzer sieht nur, dass ein Vorschlag fehlt.
 *
 * Der Wortanfang trifft trotzdem, was er soll, weil Niederländisch
 * Zusammensetzungen vorn bildet: „kipfilet", „rundergehakt",
 * „varkenshaas", „spekblokjes" fangen alle mit ihrem Fleisch an.
 */
const FLEISCH = [
  'kip', 'rund', 'varken', 'gehakt', 'spek', 'ham', 'worst', 'bacon', 'salami',
  'biefstuk', 'lam', 'kalkoen', 'eend', 'vis', 'zalm', 'tonijn', 'garnal',
  'kabeljauw', 'makreel', 'haring', 'ansjovis', 'mossel', 'inktvis',
  'chorizo', 'schnitzel', 'shoarma', 'vlees',
];

export function istVegetarisch(recipe: Recipe): boolean {
  return !recipe.ingredients.some((i) =>
    i.name
      .toLowerCase()
      .split(/[^a-zäöüß]+/)
      .some((wort) => FLEISCH.some((f) => wort.startsWith(f))),
  );
}

/**
 * Wie viele Gerichte gleichzeitig bepreist werden.
 *
 * Nicht alle auf einmal, obwohl die Produktsuche ungedrosselt ist: Jedes
 * Gericht löst ein Dutzend Produktsuchen aus, zwölf Gerichte also gut
 * hundert gleichzeitige Verbindungen. Ein solcher Schwall hat beim Messen
 * Nodes HTTP-Schicht zum Absturz gebracht (`AssertionError` in undici beim
 * Verbindungsabbau) und ist gegenüber AH ohnehin unhöflich. Drei gleichzeitig
 * sind schnell genug — der Engpass bleibt der Rezeptabruf mit seiner Sekunde
 * Wartezeit.
 */
const PREIS_GLEICHZEITIG = 3;

/**
 * Arbeitet eine Liste ab, aber nie mehr als `limit` Stück gleichzeitig.
 *
 * Der kleine Bruder von `Promise.all`: dieselbe Nebenläufigkeit, aber mit
 * Deckel. Fehler einzelner Aufgaben bleiben deren Sache — der Aufrufer
 * fängt sie in der Aufgabe selbst ab.
 */
async function nacheinander<T>(
  items: T[],
  limit: number,
  arbeit: (item: T) => Promise<void>,
): Promise<void> {
  let naechster = 0;
  const arbeiter = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (naechster < items.length) {
      const eigener = items[naechster++];
      await arbeit(eigener);
    }
  });
  await Promise.all(arbeiter);
}

/**
 * Legt eine Ergebnis-Zwischenablage um einen Anbieter.
 *
 * Beim Bewerten von zwölf Kandidaten kommt „ui" ein Dutzend Mal vor. Ohne
 * Zwischenablage wäre das ein Dutzend Anfragen für dieselbe Antwort; mit
 * ihr eine. Das ist der Unterschied, der echte Preise überhaupt bezahlbar
 * macht — gemessen etwa 90 statt 300 Anfragen für einen Wochenvorschlag.
 */
export function withPriceCache(inner: PriceProvider): PriceProvider {
  const cache = new Map<string, Promise<SearchResult>>();

  return {
    ...inner,
    // Methoden über den Prototyp würden beim Spreizen verlorengehen, deshalb
    // ausdrücklich durchreichen — und `this` an das Original binden.
    getProductById: (id) => inner.getProductById(id),
    getCategories: () => inner.getCategories(),
    getSubCategories: (id) => inner.getSubCategories(id),
    browseCategory: (id, options) => inner.browseCategory(id, options),
    searchProducts(query: string, options: SearchOptions = {}) {
      const key = `${query} ${options.size ?? ''}`;
      const treffer = cache.get(key);
      if (treffer) return treffer;
      // Das *Versprechen* wird abgelegt, nicht erst das Ergebnis: Sonst
      // liefen parallele Anfragen nach demselben Begriff aneinander vorbei
      // und suchten doppelt.
      const neu = inner.searchProducts(query, options);
      cache.set(key, neu);
      return neu;
    },
  };
}

/**
 * Gesundheitsnote aus AHs eigenen Nährwerten, 0…1.
 *
 * Bewusst benennbar statt als undurchschaubare Formel: Eiweiß hebt, viel
 * gesättigtes Fett und sehr hohe Kalorien senken. Das ist keine
 * Ernährungsberatung — es ist eine Reihenfolge, die besser ist als keine.
 */
export function healthFromNutrition(n: {
  kcal?: number;
  saturatedFat?: number;
  protein?: number;
  fat?: number;
}): number | null {
  if (n.kcal === undefined) return null;

  let score = 0.5;
  if ((n.protein ?? 0) >= 25) score += 0.2;
  else if ((n.protein ?? 0) >= 15) score += 0.1;

  if ((n.saturatedFat ?? 0) >= 15) score -= 0.2;
  else if ((n.saturatedFat ?? 0) >= 9) score -= 0.1;

  if (n.kcal > 900) score -= 0.25;
  else if (n.kcal > 700) score -= 0.1;
  else if (n.kcal < 250) score -= 0.1; // zu wenig ist auch keine Mahlzeit

  return Math.max(0, Math.min(1, score));
}

/** Zutaten ohne Vorratsware — nur die kosten wirklich Geld. */
function echteZutaten(recipe: Recipe) {
  return recipe.ingredients.filter((i) => !(i.isPantryStaple || isPantryStaple(i.name)));
}

/**
 * Was eine Portion wirklich kostet — Einkauf minus das, was übrig bleibt.
 *
 * **Der Unterschied ist gewaltig, und die naive Rechnung war falsch.** Eine
 * Messung an „Kip in romige mosterdsaus", auf eine Person gerechnet, ergab
 * **42,98 € je Portion**: Für ein Viertel Rezept kauft man trotzdem die
 * ganze Packung Hähnchen, das ganze Glas Senf, die ganze Sahne — und der
 * volle Einkauf wurde der einen Portion angelastet. Bei dieser Rechnung
 * war *jedes* Gericht zu teuer, und das Budgetfilter leerte die Woche
 * vollständig.
 *
 * Die drei übrigen Portionen sind aber nicht weg, sie liegen im
 * Kühlschrank. Genau dafür hat die App einen Vorrat, und genau darauf
 * schaut der Planer beim nächsten Vorschlag. Der Rest ist also kein
 * verlorenes Geld, sondern gebundenes — er gehört nicht in den Preis
 * dieser Mahlzeit.
 *
 * ⚠️ Die Rechnung stimmt nur, solange der Rest wirklich verbraucht wird.
 * Deshalb steht die Verwertung als **eigene** Regel neben dem Preis: Ein
 * Gericht, dessen Rest niemand mehr isst, soll nicht dadurch gut dastehen,
 * dass man den Rest herausrechnet.
 */
export function verbrauchterWert(
  total: number,
  leftoverValue: number,
  servings: number,
): number | null {
  if (servings <= 0) return null;
  const verbraucht = Math.max(0, total - leftoverValue);
  return Math.round((verbraucht / servings) * 100) / 100;
}

/**
 * Prüft, ob ein Rezept als Wochengericht taugt.
 *
 * Gibt den Grund im Klartext zurück, nicht nur `true`/`false` — der Nutzer
 * bekommt ihn zu sehen. „3 Rezepte waren Snacks" erklärt einen kurzen
 * Vorschlag; eine kommentarlos halbe Woche wirkt wie ein Fehler.
 */
export function aussortieren(
  imported: Awaited<ReturnType<typeof importRecipe>>,
  opts: { vegetarianOnly: boolean; maxMinutes?: number },
): string | null {
  const { recipe, category, totalMinutes } = imported;

  if (category && KEINE_HAUPTGERICHTE.has(category)) return `kein Hauptgericht (${category})`;
  if (recipe.servings > MAX_PORTIONEN) return `für ${recipe.servings} Portionen`;
  if (opts.vegetarianOnly && !istVegetarisch(recipe)) return 'nicht vegetarisch';
  if (opts.maxMinutes !== undefined && totalMinutes !== undefined && totalMinutes > opts.maxMinutes)
    return `${totalMinutes} Min`;

  return null;
}

/**
 * Stellt eine Woche aus Allerhande zusammen.
 *
 * Zwei Schritte: erst Kandidaten sammeln (billig, eine Anfrage je Wunsch),
 * dann die besten im Detail holen (teuer, eine Anfrage je Rezept). Ohne
 * diese Trennung würde jeder Vorschlag hundert Seiten ziehen.
 */
export async function adviseWeek(req: AdvisorRequest): Promise<AdvisorResult> {
  const {
    wishes,
    days,
    pantry,
    rejected = [],
    servings = 1,
    maxPricePerServing,
    vegetarianOnly = false,
    maxMinutes,
    provider,
  } = req;
  const abgelehnt = new Set(rejected);
  const preise = provider ? withPriceCache(provider) : null;
  const filtered: { title: string; reason: string }[] = [];

  // ── Schritt 1: Kandidaten sammeln ──────────────────────────────────
  //
  // Jeder Kandidat merkt sich, aus welchem Wunsch er stammt. Ohne das
  // verdrängt die Überschneidungsregel den zweiten Wunsch: Wer „kip, soep"
  // sagt, bekam drei Hähnchengerichte und keine Suppe, weil Hähnchen
  // untereinander mehr Zutaten teilen.
  const kandidaten: { hit: RecipeHit; wunsch: string | null }[] = [];
  const gesehen = new Set<string>();
  const unmatched: string[] = [];

  const quellen = wishes.length > 0 ? wishes : FALLBACK_KATEGORIEN;

  for (const quelle of quellen) {
    try {
      const treffer = wishes.length > 0
        ? await searchRecipes(quelle, 8)
        : await browseCategory(quelle, 8);

      if (treffer.length === 0 && wishes.length > 0) unmatched.push(quelle);

      for (const t of treffer) {
        if (gesehen.has(t.id) || abgelehnt.has(t.id)) continue;
        gesehen.add(t.id);
        kandidaten.push({ hit: t, wunsch: wishes.length > 0 ? quelle : null });
      }
    } catch {
      if (wishes.length > 0) unmatched.push(quelle);
    }
  }

  if (kandidaten.length === 0) {
    return { picks: [], unmatched, fetched: 0, filtered };
  }

  // ── Schritt 2: Details holen, begrenzt ─────────────────────────────
  // Mehr Kandidaten als Tage, damit es etwas auszuwählen gibt — aber
  // gedeckelt, weil jeder Abruf eine Sekunde kostet.
  // Reihum aus jedem Wunsch schöpfen statt der Reihe nach: Sonst wären bei
  // zwei Wünschen und acht Abrufen alle acht aus dem ersten.
  // Großzügiger holen als früher: Der Portions- und Kategoriefilter wirft
  // einen Teil weg, und was übrig bleibt, muss immer noch für `days`
  // Vorschläge reichen. Ohne den Aufschlag käme bei einer snackreichen
  // Kategorie am Ende nur die Hälfte der Woche zustande.
  const zuHolen = verschraenken(kandidaten, Math.min(MAX_ABRUFE, Math.max(days * 4, 10)));
  const geholt: {
    hit: RecipeHit;
    wunsch: string | null;
    imported: Awaited<ReturnType<typeof importRecipe>>;
  }[] = [];

  for (const { hit, wunsch } of zuHolen) {
    // Genug Brauchbares beisammen — jeder weitere Abruf kostet eine
    // Sekunde Wartezeit für einen Kandidaten, der ohnehin nicht mehr
    // gebraucht wird.
    if (geholt.length >= Math.max(days * 2, 6)) break;

    let imported: Awaited<ReturnType<typeof importRecipe>>;
    try {
      imported = await importRecipe(hit.path, newId());
    } catch {
      // Ein Rezept, das sich nicht lesen lässt, fällt still heraus.
      continue;
    }

    const grund = aussortieren(imported, { vegetarianOnly, maxMinutes });
    if (grund) {
      filtered.push({ title: imported.recipe.title, reason: grund });
      continue;
    }

    geholt.push({ hit, wunsch, imported });
  }

  // ── Schritt 2b: Preise holen ───────────────────────────────────────
  // Läuft über api.ah.nl und ist damit **nicht** gedrosselt — anders als
  // die Rezeptseiten. Alle Kandidaten parallel, mit gemeinsamer
  // Zwischenablage: „ui" wird einmal gesucht, nicht zwölfmal.
  const preisJePortion = new Map<string, { price: number; utilization?: number }>();
  if (preise) {
    await nacheinander(
      geholt,
      PREIS_GLEICHZEITIG,
      async ({ hit, imported }) => {
        try {
          const liste = await buildShoppingList([scaleRecipe(imported.recipe, servings)], preise, {
            pantry,
          });
          const st = calculateStats(liste);
          const preis = verbrauchterWert(st.total, st.leftoverValue, servings);
          if (preis !== null) {
            preisJePortion.set(hit.id, {
              price: preis,
              utilization: st.utilization ?? undefined,
            });
          }
        } catch {
          // Ohne Preis wird das Gericht nicht ausgeschlossen, nur nicht
          // bevorzugt — ein Ausfall der Produktsuche darf den ganzen
          // Vorschlag nicht leeren.
        }
      },
    );
  }

  // ── Schritt 3: gierig auswählen ────────────────────────────────────
  //
  // Als Funktion, weil sie unter Umständen zweimal laufen muss: Ein zu
  // knappes Budget kann alles aussieben, und eine leere Woche ist die
  // schlechteste aller Antworten. Dann wird ohne Budget erneut gewählt und
  // dem Nutzer gesagt, dass seine Grenze nicht zu halten war.
  const waehlen = (budget: number | undefined): AdvisorPick[] => {
  const picks: AdvisorPick[] = [];
  const imKorb = new Set<string>();
  const abgedeckteWuensche = new Set<string>();
  let verbleibenderVorrat = pantry;

  while (picks.length < days && geholt.length > picks.length) {
    let best: AdvisorPick | null = null;
    let bestIndex = -1;

    geholt.forEach((k, i) => {
      if (picks.some((p) => p.hit.id === k.hit.id)) return;

      const { recipe, nutrition, totalMinutes } = k.imported;
      const zutaten = echteZutaten(recipe);
      const reasons: string[] = [];
      let score = 0;

      // Gesund — die stärkste Regel, weil der Nutzer sie ausdrücklich wollte.
      const gesund = nutrition ? healthFromNutrition(nutrition) : null;
      if (gesund !== null) {
        score += 2.5 * gesund;
        if (gesund >= 0.7) reasons.push('ausgewogen');
      }

      // Günstig, Teil 1: der **echte Preis je Portion**. Die stärkste Regel
      // neben „gesund", weil der Nutzer den ersten Vorschlag ausdrücklich als
      // zu teuer zurückgemeldet hat.
      //
      // Die Skala ist bewusst auf den Alltag gelegt: 1,50 € je Portion gilt
      // als günstig (volle Punktzahl), ab 6 € gibt es nichts mehr. Dazwischen
      // linear. Ein Gericht ohne Preis bekommt weder Bonus noch Malus — es
      // soll nicht dafür bestraft werden, dass die Produktsuche versagt hat.
      const p = preisJePortion.get(k.hit.id);
      if (p) {
        const guenstig = Math.max(0, Math.min(1, (6 - p.price) / 4.5));
        score += 3.0 * guenstig;
        reasons.push(`${p.price.toFixed(2).replace('.', ',')} € je Portion`);

        // Verwertung als eigene Regel, nicht nur über den Preis: Ein
        // billiges Gericht, das ein 400-g-Glas für zwei Löffel aufmacht,
        // hinterlässt Reste, die nächste Woche niemand isst.
        if (p.utilization !== undefined) {
          score += 1.2 * p.utilization;
          if (p.utilization >= 0.7) reasons.push(`${Math.round(p.utilization * 100)} % verwertet`);
        }
      }

      // Günstig, Teil 2: wenige Zutaten. Jede Zutat ist eine Packung — das
      // gilt auch dann, wenn jede einzelne billig ist.
      const wenig = Math.max(0, 1 - zutaten.length / 16);
      score += 1.0 * wenig;
      if (zutaten.length <= 7) reasons.push(`nur ${zutaten.length} Zutaten`);

      // Günstig, Teil 2: Überschneidung mit dem schon Gewählten.
      const schluessel = zutaten.map((z) => z.id);
      const gemeinsam = schluessel.filter((x) => imKorb.has(x)).length;
      if (zutaten.length > 0 && gemeinsam > 0) {
        score += 1.8 * (gemeinsam / zutaten.length);
        reasons.push(`teilt ${gemeinsam} ${gemeinsam === 1 ? 'Zutat' : 'Zutaten'}`);
      }

      // Vorrat — gegen den verbleibenden, damit nichts doppelt zählt.
      const gedeckt = zutaten.filter(
        (z) => deductFromPantry(z, verbleibenderVorrat).covered > 0,
      ).length;
      const vorratsanteil = zutaten.length > 0 ? gedeckt / zutaten.length : 0;
      if (vorratsanteil > 0) {
        score += 2.0 * vorratsanteil;
        reasons.push(`${Math.round(vorratsanteil * 100)} % aus dem Vorrat`);
      }

      // Ein Wunsch, der noch gar nicht vertreten ist, wiegt schwer. Wer
      // „kip, soep" sagt, will beides — nicht dreimal das Erste, nur weil
      // Hähnchen untereinander mehr Zutaten teilen.
      if (k.wunsch && !abgedeckteWuensche.has(k.wunsch)) {
        score += 2.6;
        reasons.push(`deckt „${k.wunsch}" ab`);
      }

      // Schnell ist ein Nebenkriterium, kein Ziel.
      if (totalMinutes !== undefined && totalMinutes <= 30) {
        score += 0.4;
        reasons.push(`${totalMinutes} Min`);
      }

      // Budget als harte Grenze, wenn der Nutzer eine gesetzt hat. Bewusst
      // erst hier und nicht beim Holen: Ohne Preis kein Urteil, und der
      // Preis steht erst nach dem Import fest.
      if (budget !== undefined && p && p.price > budget) return;

      const kandidat: AdvisorPick = {
        hit: k.hit,
        recipe,
        score: Math.round(score * 100) / 100,
        reasons,
        kcalPerServing: nutrition?.kcal,
        proteinPerServing: nutrition?.protein,
        ingredientCount: zutaten.length,
        pantryShare: vorratsanteil,
        totalMinutes,
        pricePerServing: p?.price,
        utilization: p?.utilization,
      };

      if (!best || kandidat.score > best.score) {
        best = kandidat;
        bestIndex = i;
      }
    });

    if (!best || bestIndex < 0) break;

    const gewaehlt: AdvisorPick = best;
    picks.push(gewaehlt);
    for (const z of echteZutaten(gewaehlt.recipe)) imKorb.add(z.id);
    const quelle = geholt[bestIndex]?.wunsch;
    if (quelle) abgedeckteWuensche.add(quelle);
    verbleibenderVorrat = consume(verbleibenderVorrat, gewaehlt.recipe);
  }

    return picks;
  };

  let picks = waehlen(maxPricePerServing);

  // Lieber ein Vorschlag über Budget als gar keiner: Eine leere Woche sagt
  // dem Nutzer nur „nein", ein zu teurer sagt ihm, was es kosten würde —
  // und er kann das Budget bewusst anheben oder ablehnen.
  let budgetRelaxed = false;
  if (picks.length === 0 && maxPricePerServing !== undefined) {
    picks = waehlen(undefined);
    budgetRelaxed = picks.length > 0;
  }

  // ── Schritt 4: was die Woche wirklich kostet ───────────────────────
  //
  // Nicht die Summe der Einzelpreise: Gerichte teilen sich Packungen, und
  // genau das ist der Sinn eines Wochenplans. Eine Liste über alle
  // Gewählten zusammen rechnet das aus — und liefert nebenbei die
  // Verwertung, die der Nutzer als schlechteste Zahl gemeldet hatte.
  let totalPrice: number | undefined;
  let totalUtilization: number | undefined;
  if (preise && picks.length > 0) {
    try {
      const liste = await buildShoppingList(
        picks.map((p) => scaleRecipe(p.recipe, servings)),
        preise,
        { pantry },
      );
      const st = calculateStats(liste);
      totalPrice = st.total;
      totalUtilization = st.utilization ?? undefined;
    } catch {
      // Kein Wochenpreis ist ein fehlender Hinweis, kein Fehler.
    }
  }

  // Kandidaten, die es bis zur Bewertung geschafft haben, dort aber am
  // Budget gescheitert sind, gehören auch in die Rechenschaft.
  if (maxPricePerServing !== undefined && !budgetRelaxed) {
    for (const k of geholt) {
      if (picks.some((p) => p.hit.id === k.hit.id)) continue;
      const p = preisJePortion.get(k.hit.id);
      if (p && p.price > maxPricePerServing) {
        filtered.push({
          title: k.imported.recipe.title,
          reason: `${p.price.toFixed(2).replace('.', ',')} € je Portion`,
        });
      }
    }
  }

  return {
    picks,
    unmatched,
    fetched: geholt.length,
    totalPrice,
    totalUtilization,
    filtered,
    budgetRelaxed,
  };
}

/**
 * Nimmt reihum aus jeder Gruppe, statt eine nach der anderen zu leeren.
 *
 * Bei zwei Wünschen und acht Abrufen kämen sonst alle acht aus dem ersten
 * Wunsch — der zweite hätte nie eine Chance, in die Auswahl zu kommen.
 */
function verschraenken<T extends { wunsch: string | null }>(items: T[], limit: number): T[] {
  const gruppen = new Map<string, T[]>();
  for (const item of items) {
    const key = item.wunsch ?? '';
    const liste = gruppen.get(key) ?? [];
    liste.push(item);
    gruppen.set(key, liste);
  }

  const raus: T[] = [];
  let runde = 0;
  while (raus.length < limit) {
    let etwasGenommen = false;
    for (const liste of gruppen.values()) {
      if (runde < liste.length && raus.length < limit) {
        raus.push(liste[runde]);
        etwasGenommen = true;
      }
    }
    if (!etwasGenommen) break;
    runde++;
  }
  return raus;
}

/** Bucht den Verbrauch eines Rezepts aus dem Vorrat aus. */
function consume(pantry: PantryItem[], recipe: Recipe): PantryItem[] {
  let rest = pantry;
  for (const z of echteZutaten(recipe)) {
    const d = deductFromPantry(z, rest);
    if (d.fullyCovered) rest = rest.filter((p) => p.id !== z.id);
  }
  return rest;
}
