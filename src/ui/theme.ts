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
 * Farbe einer Supermarkt-Abteilung.
 *
 * Vorher stand hier ein Emoji je Abteilung. Der Gedanke war richtig — im
 * Laden erkennt man ein Symbol vor dem Wort —, die Umsetzung nicht: Emoji
 * sehen auf jedem System anders aus und bringen ihre eigene Farbe mit, die
 * mit der Palette nichts zu tun hat.
 *
 * Ein Farbstreifen leistet dasselbe und bleibt Teil des Entwurfs: Man sieht
 * beim Scrollen, wo eine neue Abteilung anfängt, ohne zu lesen. Die
 * Zuordnung folgt der Ware, nicht dem Zufall — Grün für Frisches, Rot für
 * Fleisch, Blau für Gekühltes.
 *
 * Die Schlüssel sind Albert Heijns eigene Abteilungsnamen.
 */
export function categoryColor(category?: string): string {
  if (!category) return colors.textFaint;
  const c = category.toLowerCase();

  if (c.startsWith('groente')) return '#5fa83d';        // Gemüse
  if (c.startsWith('fruit')) return '#e0632b';          // Obst
  if (c.startsWith('vlees')) return '#b4453a';          // Fleisch
  if (c.startsWith('vis')) return '#3d7f9c';            // Fisch
  if (c.startsWith('kaas')) return '#d9a300';           // Käse
  if (c.startsWith('zuivel')) return '#7aa8c4';         // Molkerei
  if (c.startsWith('bakkerij') || c.startsWith('brood')) return '#a9793f';
  if (c.startsWith('pasta') || c.includes('rijst')) return '#c9962f';
  if (c.startsWith('soepen') || c.includes('kruiden')) return '#6b8f5a';
  if (c.startsWith('ontbijt')) return '#c08a2e';
  if (c.startsWith('diepvries')) return '#5b93b5';      // Tiefkühl
  if (c.startsWith('frisdrank') || c.includes('sappen')) return '#4f9d8b';
  if (c.startsWith('bier') || c.includes('wijn')) return '#8a4a6b';
  if (c.startsWith('borrel') || c.includes('chips')) return '#a8763c';
  if (c.startsWith('koek') || c.includes('snoep')) return '#b06a8a';
  if (c.startsWith('maaltijden') || c.includes('salades')) return '#6fa356';
  if (c.startsWith('vegetarisch') || c.includes('plantaardig')) return '#4d9130';
  if (c.startsWith('baby')) return '#c9a0b8';
  if (c.startsWith('drogisterij') || c.includes('verzorging')) return '#8f9aa8';
  if (c.startsWith('huishouden') || c.includes('schoonmaak')) return '#7d8b96';
  if (c.startsWith('huisdier')) return '#9c8464';
  return colors.textFaint;
}

/**
 * Monogramm und Farbe für ein Gericht.
 *
 * Ersetzt die Gerichts-Emoji. Ein Teller-Symbol für „Carbonara" und ein
 * Teller-Symbol für „Gurkensalat" unterscheiden nichts — der erste
 * Buchstabe in einem farbigen Kreis unterscheidet jedes Gericht von jedem
 * anderen, und die Farbe bleibt über Sitzungen hinweg dieselbe, weil sie
 * aus dem Titel gerechnet wird.
 */
export function recipeMonogram(title: string): { letter: string; color: string } {
  const sauber = title.trim();
  const letter = (sauber[0] ?? '?').toUpperCase();

  // Einfacher, stabiler Hash: Derselbe Titel ergibt immer dieselbe Farbe.
  let hash = 0;
  for (let i = 0; i < sauber.length; i++) hash = (hash * 31 + sauber.charCodeAt(i)) >>> 0;

  const palette = [
    colors.primary,
    colors.frog,
    '#3d7f9c',
    '#a9793f',
    '#8a4a6b',
    '#c9962f',
    '#6b8f5a',
    '#b4453a',
  ];
  return { letter, color: palette[hash % palette.length] };
}
