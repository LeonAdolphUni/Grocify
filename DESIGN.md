# DESIGN.md

> Eine Sonnenblume am Teichrand: warm, freundlich und trotzdem genau — denn hier geht es am Ende um Geld und um Essen, das nicht weggeworfen wird.

**Geltungsbereich:** Landingpage (`landing/index.html`).
**Herkunft der Palette:** geerbt aus [`src/ui/theme.ts`](src/ui/theme.ts) — nicht neu erfunden. Die Landingpage und die App müssen wie dasselbe Produkt aussehen.

---

## 1. Visual Theme & Atmosphere

**Style**: Zonnebloem & Kikker — Playful Creative mit der Disziplin von Organic Natural
**Keywords**: sonnig, freundlich, warm, handgemacht, ehrlich, verspielt, geerdet, essbar
**Tone**: einladend und konkret — **NICHT** clean-corporate, nicht Startup-Purple, nicht Dark-SaaS, nicht steril
**Feel**: als würde dir jemand am Küchentisch zeigen, was der Wocheneinkauf wirklich kostet — mit einem Frosch, der nebenher zusieht

Van Goghs Zonnebloemen hängen in Amsterdam, im Polder-Graben sitzt der Frosch. Dieselbe Landschaft, in der auch der Supermarkt steht. Die Farben sind nicht Dekoration, sie sind Herkunft.

**Interaction Tier**: **L2 — flüssige Interaktion**
**Dependencies**: **CSS only + IntersectionObserver.** Kein GSAP, kein Lenis, kein Three.js, keine Fremdpakete. Das ist keine Sparsamkeit, sondern die Linie des Projekts: Das Backend nutzt `node:sqlite` statt Docker und `node:http` statt Express. Eine Landingpage, die drei Pakete nachlädt, würde dem widersprechen.

---

## 2. Color Palette & Roles

```css
:root {
  /* Backgrounds */
  --bg:             #eff6ec;   /* Teichlicht — Seitengrund */
  --surface:        #ffffff;   /* Karten, Container */
  --surface-alt:    #fffdf6;   /* Papierweiß — alternierende Sections */
  --surface-hover:  #f7fbf5;   /* Kartenfläche bei Hover */

  /* Borders */
  --border:         #d3e3d3;
  --border-hover:   #b8d3b8;

  /* Text */
  --text:           #15301d;   /* tiefes Tümpelgrün statt Schwarz */
  --text-secondary: #4a6a52;
  --text-tertiary:  #8aa392;
  --on-dark:        #f4fbef;   /* Text auf grünem Grund */
  --on-sun:         #3a2a00;   /* Text auf gelbem Grund */

  /* Accent */
  --accent:         #f7b500;   /* Zonnebloem — CTA, Hervorhebung */
  --accent-hover:   #d99000;
  --accent-soft:    #ffeab0;
  --seed:           #8a6a3b;   /* Blütenkern */

  /* Brand secondary */
  --pond:           #2f7a3e;   /* Vijver — Knöpfe, Kopfbänder */
  --pond-deep:      #1f5c2c;
  --frog:           #5fa83d;
  --frog-belly:     #cbe89a;

  /* RGB variants for rgba() */
  --bg-rgb:        239, 246, 236;
  --accent-rgb:    247, 181,   0;
  --pond-rgb:       47, 122,  62;
  --frog-rgb:       95, 168,  61;
  --text-rgb:       21,  48,  29;
  --alarm-rgb:     224,  99,  43;

  /* Semantic */
  --success:        #5fa83d;
  --success-bg:     #eef8e6;
  --warning:        #d99000;
  /* ⚠️ RESERVIERT — siehe Color Rules */
  --alarm:          #e0632b;
  --alarm-bg:       #fdeee6;
}
```

**Color Rules:**

1. **Alle Farben über CSS-Variablen. Null hartcodierte Hex-Werte im Stylesheet** — außer in diesem `:root`-Block.
2. **`--alarm` ist reserviert und bedeutet ausschließlich „hier bleibt etwas übrig".** Es darf niemals dekorativ auftauchen: nicht für Knöpfe, nicht für Hinweise, nicht für Akzentlinien. Sobald Orange auch schmückt, verliert die Einkaufsliste in der App genau die Warnung, für die sie gebaut ist. **Gelb darf schmücken — Orange nie.**
3. **Ein Akzent je Section.** Gelb *oder* Grün trägt einen Abschnitt, nicht beide gleichzeitig. Der Wechsel zwischen den Sections erzeugt den Rhythmus.
4. **Grün ist die Struktur, Gelb ist die Aufmerksamkeit.** Kopfbänder, Flächen und Text tragen Grün; nur das, was geklickt oder gelesen werden *muss*, trägt Gelb.
5. **Text niemals reines Schwarz.** `--text` ist ein sehr dunkles Grün — das hält die ganze Seite in derselben Landschaft.

---

## 3. Typography Rules

**Font Stack:**

```css
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Nunito:wght@400;500;600;700&family=Caveat:wght@600;700&display=swap');

:root {
  --font-heading: 'Sora', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-body:    'Nunito', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-accent:  'Caveat', 'Segoe Script', cursive;
  --font-mono:    ui-monospace, 'Cascadia Mono', 'JetBrains Mono', Consolas, monospace;
}
```

| Role | Font | Size (Desktop) | Size (Mobile) | Weight | Line Height | Letter Spacing |
|------|------|---------------|---------------|--------|-------------|----------------|
| Hero H1 | Sora | `clamp(2.75rem, 7vw, 5rem)` | 2.75rem | 800 | 1.04 | −0.03em |
| Section H2 | Sora | `clamp(1.9rem, 4vw, 2.9rem)` | 1.9rem | 700 | 1.14 | −0.02em |
| H3 / Kachel-Titel | Sora | 1.2rem | 1.1rem | 700 | 1.3 | −0.01em |
| Body | Nunito | 1.0625rem | 1rem | 400 | 1.7 | — |
| Lead (Hero-Untertitel) | Nunito | `clamp(1.05rem, 2vw, 1.3rem)` | 1.05rem | 500 | 1.6 | — |
| Label / Eyebrow | Sora | 0.75rem | 0.72rem | 700 | 1.2 | 0.14em, uppercase |
| Zahl / Kennzahl | Sora | `clamp(2.2rem, 5vw, 3.6rem)` | 2.2rem | 800 | 1 | −0.02em, `tabular-nums` |
| Handschrift-Notiz | Caveat | 1.35rem | 1.2rem | 600 | 1.35 | — |
| Mono / Befehl | Mono | 0.9rem | 0.85rem | 400 | 1.6 | — |

**Typography Rules:**

- Überschriften immer Weight ≥ 700. Sora unter 700 wirkt unentschlossen.
- **Alle Zahlen** (Preise, Prozente, Kennzahlen) bekommen `font-variant-numeric: tabular-nums`. Untereinanderstehende Beträge müssen bündig sein — sonst sieht die Preisangabe unseriös aus.
- Fließtext bekommt `max-width: 62ch`. Länger liest niemand.
- Caveat ist **nur** für kurze Randnotizen (max. 6 Wörter). Nie für Fließtext, nie für Überschriften, nie für Zahlen.
- **NEVER use**: Inter, Space Grotesk, Poppins, Montserrat, Roboto, Comic Sans, Papyrus. Die ersten vier sind die Standardgriffe generierter Seiten — genau davon soll sich das hier absetzen.

**Text Decoration** (entschieden nach `text-decoration-rules.md`, Stil = Playful Creative):

- **Hero H1 → Farbverlauf: JA.** `linear-gradient(135deg, var(--accent), var(--accent-hover))` mit `background-clip: text`. Bedingung erfüllt: Stil ist Playful Creative und H1 ist Hero-Hauptüberschrift.
- **Hero H1 → Schlagschatten: NEIN.** Die Regel verbietet ausdrücklich, Schatten auf bereits verlaufende Schrift zu stapeln (visuelle Überladung). Verlauf gewinnt.
- **Section H2 → Verlauf: nur bei genau einer H2** (der Kennzahlen-Section). Überall sonst einfarbig `--text`.
- **Fließtext `p` → keinerlei Dekoration.** Ausnahmslos.
- **Eyebrow-Label** → `border-bottom: 2px solid var(--accent)`, nur unter dem Wort, nicht über die volle Breite.

---

## 4. Component Stylings

### Buttons

```css
.btn {
  --btn-bg: var(--pond);
  --btn-fg: var(--on-dark);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 48px;
  padding: 0.85rem 1.6rem;
  border: 2px solid transparent;
  border-radius: var(--r-pill);
  background: var(--btn-bg);
  color: var(--btn-fg);
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition: transform .18s cubic-bezier(.34, 1.56, .64, 1),
              box-shadow .18s ease,
              background-color .18s ease;
}

.btn:hover {
  background: var(--pond-deep);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(var(--pond-rgb), .28);
}

.btn:active {
  transform: translateY(0) scale(.98);
  box-shadow: 0 3px 8px rgba(var(--pond-rgb), .22);
}

.btn:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}

.btn:disabled,
.btn[aria-disabled='true'] {
  opacity: .45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Primär-CTA: gelb, weil er der einzige Pflichtklick der Seite ist */
.btn--sun {
  --btn-bg: var(--accent);
  --btn-fg: var(--on-sun);
}
.btn--sun:hover { background: var(--accent-hover); box-shadow: 0 8px 20px rgba(var(--accent-rgb), .38); }

/* Sekundär: Umriss */
.btn--ghost {
  --btn-bg: transparent;
  --btn-fg: var(--text);
  border-color: var(--border-hover);
}
.btn--ghost:hover { background: var(--surface); border-color: var(--pond); box-shadow: none; transform: translateY(-2px); }
```

### Cards

```css
.card {
  position: relative;
  padding: var(--sp-lg);
  border: 2px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
  transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease;
}

/* Spotlight: folgt dem Zeiger, gespeist aus --mx/--my (rAF-gedrosselt) */
.card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    260px circle at var(--mx, 50%) var(--my, 50%),
    rgba(var(--accent-rgb), .16),
    transparent 60%
  );
  opacity: 0;
  transition: opacity .25s ease;
  pointer-events: none;
}

.card:hover {
  transform: translateY(-4px);
  border-color: var(--border-hover);
  box-shadow: 0 12px 28px rgba(var(--text-rgb), .09);
}
.card:hover::before { opacity: 1; }

.card:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px rgba(var(--accent-rgb), .2);
}
```

### Navigation

```css
.nav {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-md);
  padding: var(--sp-md) var(--sp-xl);
  background: rgba(var(--bg-rgb), .72);
  backdrop-filter: blur(10px);           /* ≤ 14px, nur Kopfleiste */
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid transparent;
  transition: background-color .25s ease, border-color .25s ease, padding .25s ease;
}

/* Zustand nach dem Scrollen — per IntersectionObserver gesetzt */
.nav[data-scrolled='true'] {
  background: rgba(var(--bg-rgb), .93);
  border-bottom-color: var(--border);
  padding-top: var(--sp-sm);
  padding-bottom: var(--sp-sm);
}

.nav__link {
  padding: .5rem .25rem;
  color: var(--text-secondary);
  font-family: var(--font-heading);
  font-size: .9rem;
  font-weight: 600;
  text-decoration: none;
  transition: color .18s ease;
}
.nav__link:hover        { color: var(--text); }
.nav__link:focus-visible{ outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 4px; }
.nav__link[aria-current='true'] { color: var(--pond); }
```

### Links

```css
.link {
  color: var(--pond);
  font-weight: 600;
  text-decoration: none;
  background-image: linear-gradient(var(--accent), var(--accent));
  background-repeat: no-repeat;
  background-position: 0 100%;
  background-size: 0% 3px;
  transition: background-size .28s ease, color .18s ease;
}
.link:hover        { color: var(--pond-deep); background-size: 100% 3px; }
.link:focus-visible{ outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 3px; }
```

### Tags / Badges

```css
.tag {
  display: inline-flex;
  align-items: center;
  gap: .35rem;
  padding: .3rem .7rem;
  border-radius: var(--r-pill);
  background: var(--accent-soft);
  color: var(--seed);
  font-family: var(--font-heading);
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
}
.tag--pond { background: var(--success-bg); color: var(--pond-deep); }

/* Einziger erlaubter Ort für Orange: echte Reste-Angaben */
.tag--rest { background: var(--alarm-bg); color: var(--alarm); text-transform: none; letter-spacing: 0; }
```

### Kennzahl (Stat)

```css
.stat__value {
  display: block;
  font-family: var(--font-heading);
  font-size: clamp(2.2rem, 5vw, 3.6rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -.02em;
  font-variant-numeric: tabular-nums;
  color: var(--pond-deep);
}
.stat__label {
  display: block;
  margin-top: .5rem;
  color: var(--text-tertiary);
  font-family: var(--font-heading);
  font-size: .75rem;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
}
```

---

## 5. Layout Principles

**Container:**
- Max width: `1120px`
- Padding: `0 clamp(1.25rem, 5vw, 2.5rem)`
- Narrow variant (Fließtext): `720px` — bewusst identisch mit `CONTENT_MAX_WIDTH` in der App

**Spacing Scale** — die App-Werte sind die unteren Sprossen, nach oben verlängert:

```css
:root {
  --sp-xs: 4px;   --sp-sm: 8px;   --sp-md: 12px;
  --sp-lg: 16px;  --sp-xl: 20px;  --sp-2xl: 28px;
  --sp-3xl: 48px; --sp-4xl: 72px; --sp-5xl: 112px;

  --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 22px; --r-pill: 999px;
}
```

- Section-Abstand: `var(--sp-5xl)` oben und unten (Mobil: `var(--sp-4xl)`)
- Abstand zwischen Komponenten: `var(--sp-2xl)`
- Karten-Innenabstand: `var(--sp-lg)` bis `var(--sp-2xl)`

**Grid — Bento, bewusst ungleich groß:**

```css
.bento {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--sp-lg);
}
.bento__item--wide  { grid-column: span 4; }
.bento__item--half  { grid-column: span 3; }
.bento__item--third { grid-column: span 2; }
.bento__item--tall  { grid-column: span 2; grid-row: span 2; }

@media (max-width: 900px) { .bento { grid-template-columns: repeat(2, 1fr); }
  .bento__item--wide, .bento__item--half { grid-column: span 2; }
  .bento__item--third, .bento__item--tall { grid-column: span 1; grid-row: span 1; } }
@media (max-width: 600px) { .bento { grid-template-columns: 1fr; }
  .bento__item--wide, .bento__item--half, .bento__item--third, .bento__item--tall { grid-column: span 1; } }
```

Gleich große Kacheln sind hier verboten — der Skill verlangt für die Aufzählungs-Section ein ungleiches Raster, und inhaltlich stimmt es auch: Der Wochenplan ist wichtiger als das Icon daneben.

---

## 6. Depth & Elevation

Schatten sind **grün getönt**, nie neutralgrau. Ein grauer Schatten auf grünem Grund sieht schmutzig aus.

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat | keine | Sections, Bänder, Fließtext-Blöcke |
| Hairline | `border: 1px solid var(--border)` | Trennungen, Tabellen |
| Subtle | `0 2px 8px rgba(var(--text-rgb), .06)` | Karten im Ruhezustand |
| Elevated | `0 12px 28px rgba(var(--text-rgb), .09)` | Karten bei Hover |
| Lifted | `0 8px 20px rgba(var(--pond-rgb), .28)` | Knöpfe bei Hover (farbiger Schatten) |
| Glow | `0 0 0 4px rgba(var(--accent-rgb), .2)` | Fokusring, nur Tastatur |

```css
:root {
  --sh-subtle:   0 2px 8px rgba(var(--text-rgb), .06);
  --sh-elevated: 0 12px 28px rgba(var(--text-rgb), .09);
  --sh-lifted:   0 8px 20px rgba(var(--pond-rgb), .28);
  --sh-glow:     0 0 0 4px rgba(var(--accent-rgb), .2);
}
```

---

## 7. Animation & Interaction

**Motion Philosophy**: Alles bewegt sich, als hätte es ein kleines Gewicht — Sprungkurve statt linear. Aber nichts bewegt sich, ohne etwas zu bedeuten.
**Tier**: **L2**

### Dependencies

```html
<!-- keine -->
```

Kein GSAP, kein Lenis, kein Three.js. Alles unten läuft mit CSS-Transitions, CSS-Keyframes und einem `IntersectionObserver`.

### Base Setup

```js
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = window.matchMedia('(hover: hover)').matches;

/* Scroll-Reveal: ein Observer für die ganze Seite */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.dataset.visible = 'true';
    io.unobserve(e.target);            // einmal sichtbar = fertig, kein Dauerbeobachten
  }
}, { threshold: .18, rootMargin: '0px 0px -8% 0px' });

document.querySelectorAll('[data-reveal]').forEach((el) => {
  if (reduced) { el.dataset.visible = 'true'; return; }
  io.observe(el);
});
```

### Entrance Animation

```css
[data-reveal] {
  opacity: 0;
  transform: translateY(22px);
  transition: opacity .7s ease, transform .7s cubic-bezier(.22, 1, .36, 1);
}
[data-reveal][data-visible='true'] { opacity: 1; transform: none; }

/* Staffelung über Inline-Variable --i */
[data-reveal] { transition-delay: calc(var(--i, 0) * 90ms); }

/* Hero-H1: Maskenenthüllung (Signature #1) */
@keyframes maskUp {
  from { clip-path: inset(0 0 100% 0); transform: translateY(.28em); }
  to   { clip-path: inset(0 0 0 0);    transform: none; }
}
.hero__title > span {
  display: inline-block;
  animation: maskUp .9s cubic-bezier(.22, 1, .36, 1) backwards;
}
.hero__title > span:nth-child(2) { animation-delay: .12s; }
.hero__title > span:nth-child(3) { animation-delay: .24s; }

/* Verlauf fließt langsam (Signature #1, Dauerzustand) */
@keyframes sunFlow { to { background-position: 200% center; } }
.hero__title em {
  font-style: normal;
  background: linear-gradient(135deg, var(--accent), var(--accent-hover), var(--accent));
  background-size: 200% auto;
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
  animation: sunFlow 7s linear infinite;
}
```

### Scroll Behavior

```js
/* Navigationszustand */
const nav = document.querySelector('.nav');
const sentinel = document.querySelector('#top-sentinel');
new IntersectionObserver(
  ([e]) => { nav.dataset.scrolled = String(!e.isIntersecting); },
  { threshold: 0 },
).observe(sentinel);

/* Kennzahlen zählen hoch (Signature #3) */
function countUp(el) {
  const target = Number(el.dataset.count);
  const decimals = Number(el.dataset.decimals ?? 0);
  const suffix = el.dataset.suffix ?? '';
  if (reduced) { el.textContent = target.toFixed(decimals) + suffix; return; }
  const start = performance.now(), dur = 1100;
  const tick = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (target * eased).toFixed(decimals).replace('.', ',') + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
```

**Parallax** — nur die Hintergrund-Sonnenblume, über `transform: translate3d()`, gedrosselt mit `requestAnimationFrame`. Verschiebung maximal 40 px; mehr wirkt seekrank und kostet Repaints.

### Hover & Focus States

```css
/* Zeiger-Spotlight auf Karten (Signature #5): EIN Listener, rAF-gedrosselt */
```

```js
if (canHover && !reduced) {
  let queued = false, pending = [];
  document.addEventListener('pointermove', (ev) => {
    pending = [ev.clientX, ev.clientY];
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const [x, y] = pending;
      const card = document.elementFromPoint(x, y)?.closest('.card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${x - r.left}px`);
      card.style.setProperty('--my', `${y - r.top}px`);
    });
  }, { passive: true });
}
```

Jedes interaktive Element hat `:hover` **und** `:focus-visible` — siehe Abschnitt 4. Fokusringe werden nie entfernt.

### Special Effects

**Signature-Motion, die sechs Pflichtkategorien für L2:**

| # | Kategorie | Umsetzung | Kosten |
|---|-----------|-----------|--------|
| 1 | Text — Hero H1 | `clip-path`-Maskenenthüllung + fließender Farbverlauf | sehr gering |
| 2 | Text — Section H2 | Scroll-Reveal mit `opacity` + `translateY` (**kein** `blur()`) | sehr gering |
| 3 | Text — Body/Label | gestaffeltes Reveal + hochzählende Kennzahlen | gering |
| 4 | Element | Knopf-Anhebung mit Sprungkurve, Kees blinzelt bei Hover | sehr gering |
| 5 | Komponente | Spotlight-Karten, Zeiger-Verlauf über `--mx/--my` | gering |
| 6 | Hintergrund | langsam drehende Sonnenblume (`rotate`, 90 s) + driftendes Teichlicht (`radial-gradient`) | sehr gering |

**Der kleine Einfall** (ein Detail, das man übersieht oder über das man lacht): Kees, der Frosch, **blinzelt alle 9 Sekunden von selbst** — ein 120-ms-`scaleY(0.1)` auf den Augen. Zeigt man mit dem Zeiger auf ihn, blinzelt er sofort und die Sprechblase wechselt den Text. Wer bis zum Seitenende scrollt, findet ihn dort mit „Du hast bis hier gelesen. Ich sitze schon den ganzen Tag hier."

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
  [data-reveal] { opacity: 1 !important; transform: none !important; }
  .hero__title > span { animation: none; clip-path: none; }
  .hero__title em { animation: none; background-position: 0 center; }
  .sunflower--ambient, .pondlight { animation: none; }
  .card::before { display: none; }
}
```

Das JavaScript prüft `reduced` zusätzlich selbst: Kennzahlen springen direkt auf den Endwert, Parallax und Spotlight werden gar nicht erst verdrahtet. CSS allein würde die `requestAnimationFrame`-Schleifen nicht stoppen.

---

## 8. Do's and Don'ts

### Do

- **Zeig echte Zahlen.** 40,17 € · 85 % Verwertung · 1,43 € je Portion — alles gemessen, nicht erfunden. Konkrete Beträge sind das stärkste Argument der Seite.
- **Erbe die Palette aus `theme.ts`.** Ändert sich dort eine Farbe, ändert sie sich hier mit.
- **Gib jeder Zahl `tabular-nums`.** Beträge müssen bündig untereinanderstehen.
- **Nenne die Einschränkung.** Dass die AH-Anbindung ein internes Backend nutzt und Jumbo zu ist, gehört auf die Seite. Ehrlichkeit ist hier Teil des Charakters, nicht ein Makel.
- **Halte jedes Touch-Ziel bei ≥ 44 × 44 px** und jeden Fokusring sichtbar.
- **Setze pro Section genau einen Akzent.** Der Wechsel Gelb → Grün → Gelb trägt den Rhythmus.

### Don't

- ❌ **Niemals `--alarm` (Orange) dekorativ verwenden.** Es bedeutet ausschließlich „hier bleibt etwas übrig". Kein Knopf, keine Linie, kein Icon in Orange, außer es benennt echte Reste.
- ❌ **Kein `filter: blur()` auf bewegten Elementen.** Für Tiefe `opacity` + `scale` nehmen. Bewegter Blur kostet auf jedem Repaint GPU-Speicher.
- ❌ **Kein `backdrop-filter` über 14 px und nicht auf großen Scrollflächen.** Nur die Kopfleiste, dort 10 px.
- ❌ **Kein GSAP, kein Lenis, kein Three.js, kein Tailwind.** L2 verlangt sie nicht, und das Projekt lebt von wenigen Abhängigkeiten.
- ❌ **Kein Scroll-Jacking.** Natives Scrollen bleibt unangetastet.
- ❌ **Keine Emoji als Icons in der Fließstruktur.** Inline-SVG. (Ausnahme: die Abteilungssymbole, die aus der App stammen und dort Bedeutung tragen.)
- ❌ **Keine Farbflächen als Bildplatzhalter.** Entweder echter Screenshot der App oder gezeichnetes SVG.
- ❌ **Keine hartcodierten Hex-Werte** außerhalb des `:root`-Blocks.
- ❌ **Kein zweiter Zeiger-Listener.** Genau einer, `passive`, rAF-gedrosselt.
- ❌ **Kein eigener Mauszeiger.** Grocify ist ein Werkzeug, keine Designagentur-Seite.
- ❌ **Keine erfundenen Testimonials, keine Logo-Leisten, keine „vertraut von 10.000 Nutzern".** Die App hat genau einen Nutzer. Das zu behaupten wäre gelogen.
- ❌ **Kein Inter, Poppins, Montserrat oder Space Grotesk.** Siehe Abschnitt 3.

---

## 9. Responsive Behavior

**Breakpoints:**

| Name | Width | Key Changes |
|------|-------|-------------|
| Desktop | > 900px | Bento über 6 Spalten, Hero zweispaltig (Text ‖ Illustration), Navigation waagerecht |
| Tablet | 600–900px | Bento auf 2 Spalten, Hero einspaltig, Illustration unter dem Text, Kennzahlen 3 nebeneinander |
| Mobile | < 600px | Alles einspaltig, Navigationslinks eingeklappt, Kennzahlen gestapelt, Banderole langsamer |

**Touch Targets:** mindestens **44 × 44 px**, Knöpfe `min-height: 48px`.

**Collapsing Strategy:** Erst wird das Raster schmaler, dann fällt die Illustration unter den Text, zuletzt klappen die Navigationslinks weg. Der CTA bleibt in **jeder** Breite sichtbar.

```css
@media (max-width: 900px) {
  .hero { grid-template-columns: 1fr; text-align: left; }
  .hero__art { order: 2; max-width: 380px; margin-inline: auto; }
  .stats { grid-template-columns: repeat(3, 1fr); }
  :root { --sp-5xl: 72px; }
}

@media (max-width: 600px) {
  .nav__links { display: none; }
  .stats { grid-template-columns: 1fr; gap: var(--sp-2xl); }
  .marquee { animation-duration: 34s; }
  .hero__title { font-size: 2.75rem; }
  :root { --sp-5xl: 56px; --sp-4xl: 40px; }
}

/* Pflicht: nirgends waagerechter Überlauf */
html, body { overflow-x: hidden; }
img, svg { max-width: 100%; height: auto; }
```
