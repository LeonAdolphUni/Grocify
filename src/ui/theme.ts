/**
 * Zonnebloem & Kikker — die Gestaltungswerte der App.
 *
 * Sonnenblumengelb über Tümpelgrün. Beides steht nicht zufällig hier:
 * Van Goghs Zonnebloemen hängen in Amsterdam, im Polder-Graben sitzt der
 * Frosch — dieselbe Landschaft, in der auch der Supermarkt steht.
 *
 * ⚠️ `alarm` ist reserviert. Es bedeutet immer „hier bleibt etwas übrig"
 * und wird nie dekorativ verwendet. Sobald es auch für Knöpfe oder Hinweise
 * auftaucht, verliert die Einkaufsliste genau die Warnung, für die sie
 * gebaut ist. Gelb darf schmücken — Orange nie.
 */

export const colors = {
  bg: '#eff6ec', // Teichlicht
  surface: '#ffffff',
  surfaceWarm: '#fffdf6', // Papierweiß für Listenflächen
  border: '#d3e3d3',
  borderStrong: '#b8d3b8',

  text: '#15301d', // tiefes Tümpelgrün statt Schwarz
  textMuted: '#4a6a52',
  textFaint: '#8aa392',
  onDark: '#f4fbef',

  primary: '#2f7a3e', // Vijver — Knöpfe, Kopfbänder
  primaryDeep: '#1f5c2c',

  sun: '#f7b500', // Zonnebloem
  sunDeep: '#d99000',
  sunSoft: '#ffeab0',
  seed: '#8a6a3b', // Blütenkern

  frog: '#5fa83d',
  frogBelly: '#cbe89a',

  /** Nur für Reste und Fehler. Siehe Warnung oben. */
  alarm: '#e0632b',
  alarmBg: '#fdeee6',
  successBg: '#eef8e6',
} as const;

/**
 * Schriften — dieselben wie auf der Landingpage.
 *
 * Vorher lief die App auf der Systemschrift und die Landingpage auf Sora.
 * Zwei Schriften heißen für den Betrachter: zwei Produkte. Die Familien
 * stehen deshalb hier zentral und werden über `loadWebFonts()` geladen.
 *
 * Auf dem Gerät (Expo Go) greift die Kette auf die Systemschrift zurück,
 * solange Sora nicht als Asset mitgeliefert wird — das ist gewollt, ein
 * fehlender Webfont darf keinen leeren Bildschirm erzeugen.
 */
export const fonts = {
  heading: "Sora, 'Segoe UI', system-ui, -apple-system, sans-serif",
  body: "Nunito, 'Segoe UI', system-ui, -apple-system, sans-serif",
  accent: "Caveat, 'Segoe Script', cursive",
} as const;

/**
 * Lädt die Webfonts, indem der Stylesheet-Verweis in den Kopf gehängt wird.
 *
 * Bewusst ohne `expo-font`: Das wäre eine weitere Abhängigkeit für etwas,
 * das im Browser drei Zeilen sind. Läuft nur im Web und nur einmal.
 */
export function loadWebFonts(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('grocify-fonts')) return;

  const link = document.createElement('link');
  link.id = 'grocify-fonts';
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Nunito:wght@400;500;600;700&family=Caveat:wght@600;700&display=swap';
  document.head.appendChild(link);

  // Grundschrift global setzen statt in 42 Stylesheets einzeln. Überschriften
  // und Zahlen bekommen Sora gezielt über `fonts.heading` — für die gibt es
  // keine CSS-Regel, weil man nicht nach Schriftgewicht selektieren kann.
  const style = document.createElement('style');
  style.id = 'grocify-base-font';
  style.textContent = `
    body, body input, body textarea, body button, body select {
      font-family: ${fonts.body};
    }
    /* Ziffern in Preisen und Kennzahlen müssen bündig stehen. */
    body { font-variant-numeric: tabular-nums; }
  `;
  document.head.appendChild(style);
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

/** Großzügiger als vorher — die Rundungen tragen den freundlichen Ton mit. */
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const CONTENT_MAX_WIDTH = 720;

export const euro = (value: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);

/**
 * Symbol für eine Supermarkt-Abteilung.
 *
 * Im Laden findet man „🥕 Groente" schneller als das Wort allein — das
 * Symbol wird vor dem Text erkannt. Die Schlüssel sind Albert Heijns
 * eigene Abteilungsnamen; was nicht passt, bekommt den Einkaufswagen.
 */
export function categoryIcon(category?: string): string {
  if (!category) return '🛒';
  const c = category.toLowerCase();

  if (c.startsWith('groente')) return '🥕';
  if (c.startsWith('fruit')) return '🍎';
  if (c.startsWith('vlees')) return '🥩';
  if (c.startsWith('vis')) return '🐟';
  if (c.startsWith('kaas')) return '🧀';
  if (c.startsWith('zuivel')) return '🥛';
  if (c.startsWith('bakkerij') || c.startsWith('brood')) return '🥖';
  if (c.startsWith('pasta') || c.includes('rijst')) return '🍝';
  if (c.startsWith('soepen') || c.includes('kruiden')) return '🫙';
  if (c.startsWith('ontbijt')) return '🍯';
  if (c.startsWith('diepvries')) return '🧊';
  if (c.startsWith('frisdrank') || c.includes('sappen')) return '🥤';
  if (c.startsWith('bier') || c.includes('wijn')) return '🍷';
  if (c.startsWith('borrel') || c.includes('chips')) return '🥨';
  if (c.startsWith('koek') || c.includes('snoep')) return '🍪';
  if (c.startsWith('maaltijden') || c.includes('salades')) return '🥗';
  if (c.startsWith('vegetarisch') || c.includes('plantaardig')) return '🌱';
  if (c.startsWith('baby')) return '🍼';
  if (c.startsWith('drogisterij') || c.includes('verzorging')) return '🧴';
  if (c.startsWith('huishouden') || c.includes('schoonmaak')) return '🧽';
  if (c.startsWith('huisdier')) return '🐾';
  return '🛒';
}

/**
 * Symbol für ein Gericht, geraten aus dem Titel.
 *
 * Im Wochenplan erkennt man das Gericht am Symbol schneller als am Text.
 * Bewusst grob: Trifft es nicht, steht dort ein Teller — das ist besser
 * als ein falsches Bild, das in die Irre führt.
 */
export function recipeIcon(title: string): string {
  const t = title.toLowerCase();

  if (/(spaghetti|pasta|nudel|bolognese|lasagne)/.test(t)) return '🍝';
  if (/(pizza|flammkuchen)/.test(t)) return '🍕';
  if (/(suppe|soep|eintopf)/.test(t)) return '🍲';
  if (/(pfannkuchen|crepe|waffel)/.test(t)) return '🥞';
  if (/(kartoffel|gratin|pommes|aardappel)/.test(t)) return '🥔';
  if (/(omelett|ei\b|eier|rührei)/.test(t)) return '🍳';
  if (/(reis|risotto|curry|pfanne)/.test(t)) return '🍚';
  if (/(salat|salade)/.test(t)) return '🥗';
  if (/(burger|sandwich|toast)/.test(t)) return '🍔';
  if (/(fisch|lachs|zalm|garnel)/.test(t)) return '🐟';
  if (/(huhn|hähnchen|kip|chicken)/.test(t)) return '🍗';
  if (/(steak|braten|rind|schwein|gehakt|hack)/.test(t)) return '🥩';
  if (/(brot|brood|brötchen)/.test(t)) return '🥖';
  if (/(kuchen|torte|dessert|nachtisch)/.test(t)) return '🍰';
  if (/(gemüse|veggie|vegan|vegetarisch)/.test(t)) return '🥦';
  if (/(taco|burrito|wrap)/.test(t)) return '🌮';
  if (/(sushi|asia|wok)/.test(t)) return '🍜';
  return '🍽️';
}
