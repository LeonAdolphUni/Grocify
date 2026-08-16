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
import { buildShoppingList } from '../src/domain/shoppingList';
import { isPantryStaple } from '../src/domain/translate';
import { calculateStats, type Recipe } from '../src/domain/types';
import type { PriceProvider, SearchOptions, SearchResult } from '../src/supermarkets/types';

export interface AdvisorRequest {
  /** Worauf hast du Lust — schon auf Niederländisch übersetzt. */
  wishes: string[];
  /**
   * Wie viele **Mahlzeiten** gebraucht werden — nicht wie viele Rezepte.
   *
   * Der Unterschied ist der Kern dieser Datei. Ein Rezept für vier
   * Portionen ist für eine Person kein Abendessen, sondern **vier**: Man
   * kocht einmal und isst viermal. Wer stattdessen jedes Rezept auf eine
   * Portion herunterrechnet, kauft trotzdem die ganze Packung und wirft
   * drei Viertel weg — gemessen 12,38 € Einkauf für 1,75 € Essen.
   */
  meals: number;
  pantry: PantryItem[];
  /** Rezepte, die der Nutzer schon abgelehnt hat. */
  rejected?: string[];
  /**
   * Obergrenze für den Preis je Mahlzeit, in Euro.
   *
   * **Weiche Grenze.** Bleibt darunter zu wenig übrig, wird sie gelockert
   * statt die Woche leer zu lassen — siehe `relaxed`.
   */
  maxPricePerServing?: number;
  /**
   * Nur fleischlose Gerichte vorschlagen.
   *
   * **Harte Grenze, wird nie gelockert.** Zeit und Geld sind Wünsche, eine
   * Ernährungsweise ist keiner — wer vegetarisch angibt, will kein Hähnchen
   * vorgeschlagen bekommen, auch nicht als Notlösung.
   */
  vegetarianOnly?: boolean;
  /** Höchste Zubereitungszeit in Minuten. Weiche Grenze, siehe `relaxed`. */
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
   * Was eine Mahlzeit kostet: Einkauf geteilt durch die Portionen, die das
   * Rezept ergibt.
   *
   * Bewusst **ohne** Abzug für Reste. Eine frühere Fassung zog den Restwert
   * ab, damit die 1-Portionen-Rechnung nicht absurd wurde. Das war ein
   * perverser Anreiz: Es belohnte genau die Gerichte, die viel übrig
   * lassen. Seit in voller Größe gekocht wird, braucht es den Kniff nicht
   * mehr — und ohne ihn zeigt die Zahl, was man wirklich zahlt.
   */
  pricePerServing?: number;
  /** Anteil des Gekauften, der bei diesem Gericht wirklich verkocht wird. */
  utilization?: number;
  /** Wie viele Mahlzeiten dieses Rezept ergibt — seine Portionszahl. */
  mealsCovered: number;
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
   * Welche weichen Grenzen gelockert werden mussten, und worauf.
   *
   * Muss dem Nutzer gesagt werden. Ein Vorschlag, der stillschweigend über
   * der gesetzten Grenze liegt, ist schlimmer als einer, der sie
   * überschreitet und es dazusagt.
   */
  relaxed?: { minutes?: number; budget?: number };
  /** Wie viele Mahlzeiten zusammengekommen sind. */
  mealsCovered: number;
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
 * Prüft, ob ein Rezept als Wochengericht taugt.
 *
 * Gibt den Grund im Klartext zurück, nicht nur `true`/`false` — der Nutzer
 * bekommt ihn zu sehen. „3 Rezepte waren Snacks" erklärt einen kurzen
 * Vorschlag; eine kommentarlos halbe Woche wirkt wie ein Fehler.
 */
export function aussortieren(
  imported: Awaited<ReturnType<typeof importRecipe>>,
  opts: { vegetarianOnly: boolean },
): string | null {
  const { recipe, category } = imported;

  if (category && KEINE_HAUPTGERICHTE.has(category)) return `kein Hauptgericht (${category})`;
  if (recipe.servings > MAX_PORTIONEN) return `für ${recipe.servings} Portionen`;
  if (opts.vegetarianOnly && !istVegetarisch(recipe)) return 'nicht vegetarisch';

  return null;
}

/**
 * Die Lockerungsstufen, in der Reihenfolge, in der nachgegeben wird.
 *
 * **Warum überhaupt.** Ein echter Lauf mit „7 Gerichte, höchstens 20 Min,
 * höchstens 2 €" lieferte **ein** Gericht: 19 von 20 Kandidaten fielen den
 * Filtern zum Opfer. Ein einzelnes Gericht ist keine Antwort auf „plan mir
 * die Woche".
 *
 * **Erst die Zeit, dann das Geld.** Zwanzig Minuten sind bei Allerhande
 * eine harte Grenze — die meisten Rezepte liegen bei 30 bis 40. Zehn
 * Minuten mehr öffnen das Feld weit, ohne dass es teurer wird. Am Budget
 * zu rütteln kostet dagegen sofort Geld, also kommt es zuletzt.
 *
 * Vegetarisch steht bewusst in keiner Stufe: Das ist keine Bequemlichkeit,
 * an der man sparen kann.
 */
export function lockerungsStufen(
  maxMinutes: number | undefined,
  budget: number | undefined,
): { minutes?: number; budget?: number }[] {
  const stufen: { minutes?: number; budget?: number }[] = [{ minutes: maxMinutes, budget }];

  if (maxMinutes !== undefined) {
    stufen.push({ minutes: maxMinutes + 15, budget });
    stufen.push({ minutes: undefined, budget });
  }
  if (budget !== undefined) {
    const zuletzt = stufen[stufen.length - 1].minutes;
    stufen.push({ minutes: zuletzt, budget: Math.round(budget * 1.5 * 100) / 100 });
    stufen.push({ minutes: zuletzt, budget: undefined });
  }
  return stufen;
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
    meals,
    pantry,
    rejected = [],
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
    return { picks: [], unmatched, fetched: 0, filtered, mealsCovered: 0 };
  }

  // ── Schritt 2: Details holen, begrenzt ─────────────────────────────
  // Mehr Kandidaten als Tage, damit es etwas auszuwählen gibt — aber
  // gedeckelt, weil jeder Abruf eine Sekunde kostet.
  // Reihum aus jedem Wunsch schöpfen statt der Reihe nach: Sonst wären bei
  // zwei Wünschen und acht Abrufen alle acht aus dem ersten.
  // Wie viele Rezepte für `meals` Mahlzeiten überhaupt gebraucht werden,
  // ist nicht `meals`: Ein Rezept deckt mehrere. Bei durchschnittlich vier
  // Portionen reichen für sieben Mahlzeiten zwei bis drei Gerichte. Geholt
  // wird trotzdem großzügiger, damit es etwas auszuwählen gibt und die
  // Filter nicht alles wegnehmen.
  const grobBenoetigt = Math.ceil(meals / 3);
  const zuHolen = verschraenken(kandidaten, Math.min(MAX_ABRUFE, Math.max(grobBenoetigt * 5, 12)));
  const geholt: {
    hit: RecipeHit;
    wunsch: string | null;
    imported: Awaited<ReturnType<typeof importRecipe>>;
  }[] = [];

  for (const { hit, wunsch } of zuHolen) {
    // Genug Brauchbares beisammen — jeder weitere Abruf kostet eine
    // Sekunde Wartezeit für einen Kandidaten, der ohnehin nicht mehr
    // gebraucht wird.
    if (geholt.length >= Math.max(grobBenoetigt * 3, 8)) break;

    let imported: Awaited<ReturnType<typeof importRecipe>>;
    try {
      imported = await importRecipe(hit.path, newId());
    } catch {
      // Ein Rezept, das sich nicht lesen lässt, fällt still heraus.
      continue;
    }

    // Nur die **harten** Filter. Zeit und Budget entscheiden erst bei der
    // Auswahl, damit sich beide lockern lassen, ohne noch einmal zwanzig
    // Seiten zu holen.
    const grund = aussortieren(imported, { vegetarianOnly });
    if (grund) {
      filtered.push({ title: imported.recipe.title, reason: grund });
      continue;
    }

    geholt.push({ hit, wunsch, imported });
  }

  // ── Schritt 2b: Preise holen ───────────────────────────────────────
  //
  // **In voller Rezeptgröße, nicht auf eine Portion heruntergerechnet.**
  // Das ist der ganze Unterschied: Ein Rezept für vier gekocht kostet
  // dasselbe wie dasselbe Rezept „für einen" — man kauft in beiden Fällen
  // die ganze Packung. Nur ergibt das eine vier Mahlzeiten und das andere
  // eine. Gemessen: 12,38 € Einkauf bei 14 % Verwertung gegen dieselben
  // 12,38 € bei knapp 90 %.
  //
  // Läuft über api.ah.nl und ist damit **nicht** gedrosselt — anders als
  // die Rezeptseiten.
  const preisJePortion = new Map<string, { price: number; utilization?: number }>();
  if (preise) {
    await nacheinander(
      geholt,
      PREIS_GLEICHZEITIG,
      async ({ hit, imported }) => {
        try {
          const liste = await buildShoppingList([imported.recipe], preise, { pantry });
          const st = calculateStats(liste);
          if (st.pricePerServing !== null) {
            preisJePortion.set(hit.id, {
              price: st.pricePerServing,
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
  // Als Funktion, weil sie mehrfach mit gelockerten Grenzen laufen kann.
  const waehlen = (grenze: { minutes?: number; budget?: number }): AdvisorPick[] => {
  const picks: AdvisorPick[] = [];
  const imKorb = new Set<string>();
  const abgedeckteWuensche = new Set<string>();
  let verbleibenderVorrat = pantry;
  let gedeckteMahlzeiten = 0;

  while (gedeckteMahlzeiten < meals && geholt.length > picks.length) {
    let best: AdvisorPick | null = null;
    let bestIndex = -1;

    geholt.forEach((k, i) => {
      if (picks.some((p) => p.hit.id === k.hit.id)) return;

      const { recipe, nutrition, totalMinutes } = k.imported;

      // Weiche Grenzen — hier und nicht beim Holen, damit Lockern nichts
      // kostet.
      if (grenze.minutes !== undefined && totalMinutes !== undefined && totalMinutes > grenze.minutes)
        return;

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
        // Studentischer Maßstab: 1,50 € je Mahlzeit ist volle Punktzahl,
        // ab 5 € gibt es nichts mehr.
        const guenstig = Math.max(0, Math.min(1, (5 - p.price) / 3.5));
        score += 3.0 * guenstig;
        reasons.push(`${p.price.toFixed(2).replace('.', ',')} € je Mahlzeit`);

        // Verwertung als **eigene** Regel und schwer gewichtet: Der Nutzer
        // hat ausdrücklich verlangt, dass keine Reste übrig bleiben. Ein
        // billiges Gericht, das ein 400-g-Glas für zwei Löffel aufmacht,
        // erfüllt das nicht.
        if (p.utilization !== undefined) {
          score += 2.2 * p.utilization;
          if (p.utilization >= 0.7) reasons.push(`${Math.round(p.utilization * 100)} % verwertet`);
        }
      }

      // Günstig, Teil 2: wenige Zutaten. Jede Zutat ist eine Packung — das
      // gilt auch dann, wenn jede einzelne billig ist.
      const wenig = Math.max(0, 1 - zutaten.length / 16);
      score += 1.0 * wenig;
      if (zutaten.length <= 7) reasons.push(`nur ${zutaten.length} Zutaten`);

      // Überschneidung mit dem schon Gewählten — **die stärkste Regel nach
      // dem Preis.** Genau darum ging es dem Nutzer: Gerichte, die
      // zusammenpassen, sodass eine Packung Reis für zwei Rezepte reicht
      // und nichts liegen bleibt. Wer siebenmal dieselbe Packung anbricht,
      // zahlt sie einmal und wirft nichts weg.
      const schluessel = zutaten.map((z) => z.id);
      const gemeinsam = schluessel.filter((x) => imKorb.has(x)).length;
      if (zutaten.length > 0 && gemeinsam > 0) {
        score += 2.8 * (gemeinsam / zutaten.length);
        reasons.push(`teilt ${gemeinsam} ${gemeinsam === 1 ? 'Zutat' : 'Zutaten'}`);
      }

      // Passt die Portionszahl zum Rest der Woche? Ein Rezept für sechs,
      // wenn noch zwei Mahlzeiten fehlen, lässt vier Portionen übrig — das
      // ist dasselbe Problem wie zu große Packungen, nur eine Ebene höher.
      const fehlend = meals - gedeckteMahlzeiten;
      const ueberschuss = Math.max(0, recipe.servings - fehlend);
      score -= 0.5 * Math.min(2, ueberschuss);

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

      // Budget — ebenfalls weich, siehe `lockerungsStufen`.
      if (grenze.budget !== undefined && p && p.price > grenze.budget) return;

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
        mealsCovered: recipe.servings,
      };

      if (!best || kandidat.score > best.score) {
        best = kandidat;
        bestIndex = i;
      }
    });

    if (!best || bestIndex < 0) break;

    const gewaehlt: AdvisorPick = best;
    picks.push(gewaehlt);
    gedeckteMahlzeiten += gewaehlt.mealsCovered;
    for (const z of echteZutaten(gewaehlt.recipe)) imKorb.add(z.id);
    const quelle = geholt[bestIndex]?.wunsch;
    if (quelle) abgedeckteWuensche.add(quelle);
    verbleibenderVorrat = consume(verbleibenderVorrat, gewaehlt.recipe);
  }

    return picks;
  };

  // Stufenweise lockern, bis die Mahlzeiten zusammenkommen. Ein einzelnes
  // Gericht ist keine Antwort auf „plan mir die Woche" — gemessen kam
  // genau das heraus: 1 Gericht von 7 verlangten, weil 19 Kandidaten an
  // 20 Minuten und 2 € scheiterten.
  const stufen = lockerungsStufen(maxMinutes, maxPricePerServing);
  let picks: AdvisorPick[] = [];
  let genutzteStufe = stufen[0];

  for (const stufe of stufen) {
    picks = waehlen(stufe);
    genutzteStufe = stufe;
    if (mahlzeiten(picks) >= meals) break;
  }

  // Nur melden, was sich gegenüber dem Gewünschten wirklich geändert hat.
  const relaxed =
    genutzteStufe.minutes !== maxMinutes || genutzteStufe.budget !== maxPricePerServing
      ? { minutes: genutzteStufe.minutes, budget: genutzteStufe.budget }
      : undefined;

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
        picks.map((p) => p.recipe),
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

  // Kandidaten, die es bis zur Bewertung geschafft haben, dort aber an der
  // tatsächlich genutzten Grenze gescheitert sind, gehören in die
  // Rechenschaft.
  for (const k of geholt) {
    if (picks.some((p) => p.hit.id === k.hit.id)) continue;
    const p = preisJePortion.get(k.hit.id);
    const min = k.imported.totalMinutes;

    if (genutzteStufe.budget !== undefined && p && p.price > genutzteStufe.budget) {
      filtered.push({
        title: k.imported.recipe.title,
        reason: `${p.price.toFixed(2).replace('.', ',')} € je Mahlzeit`,
      });
    } else if (genutzteStufe.minutes !== undefined && min !== undefined && min > genutzteStufe.minutes) {
      filtered.push({ title: k.imported.recipe.title, reason: `${min} Min` });
    }
  }

  return {
    picks,
    unmatched,
    fetched: geholt.length,
    totalPrice,
    totalUtilization,
    filtered,
    relaxed,
    mealsCovered: mahlzeiten(picks),
  };
}

/** Wie viele Mahlzeiten eine Auswahl zusammen ergibt. */
function mahlzeiten(picks: AdvisorPick[]): number {
  return picks.reduce((n, p) => n + p.mealsCovered, 0);
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
