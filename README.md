# Grocify

Rezept rein, smarte Einkaufsliste raus — mit echten Preisen aus dem
niederländischen Supermarktsortiment.

Der Nutzer gibt ein Rezept ein (Text, Link oder Foto), die App extrahiert
Zutaten und Mengen, ordnet ihnen konkrete Produkte zu und berechnet den
Gesamtpreis des Einkaufs.

## Stand

Die App startet **leer** — mit deinen eigenen Daten aus der Datenbank. Die
früheren Beispielrezepte sind entfernt; als feste Vorlage für die Messungen
liegen sie noch unter `scripts/fixtures.ts` und werden nie ausgeliefert.

Der komplette Ablauf funktioniert Ende zu Ende:

**Rezepte** (anlegen, bearbeiten, mehrere auswählen) → **Supermarkt wählen**
→ **Einkaufsliste** mit Mengen, Packungen und Gesamtpreis, gruppiert nach
Ladenabteilung.

Rezepte legst du selbst an — Zutaten als Freitext, „Milch 0,5 l" reicht — oder
holst sie dir **von Chefkoch** ins eigene Buch. Der Import aus Link und Foto
über die Claude API folgt in Sprint 4–5.

Dazu gibt es eine **Landingpage** unter `landing/index.html` (statisch, ohne
Build; die Spezifikation dazu liegt in [`DESIGN.md`](DESIGN.md)).

## Ablauf

| Schritt | Screen | Was passiert |
|---|---|---|
| 1 | `RecipeListScreen` | Rezepte anlegen und auswählen. Mehrfachauswahl ist Absicht — eine Wochenplanung besteht aus mehreren Rezepten |
| 1a | `ProductSearchScreen` | Beim Anlegen: echtes Produkt wählen. Einstieg über die 29 Abteilungen des Marktes (Abteilung → Unterabteilung → Produkte), Suche jederzeit zusätzlich |
| 2 | `SupermarketScreen` | Albert Heijn oder Jumbo. Nicht verfügbare Märkte werden mit Begründung angezeigt, nicht versteckt |
| 3 | `ShoppingListScreen` | Zutaten zusammenfassen, Produkte suchen, Packungen berechnen, Preise summieren |

## Produkt beim Anlegen selbst wählen

Der zuverlässigste Weg: In der Zutatenzeile **„Produkt aus dem Sortiment
wählen"** antippen. Es öffnet sich die Abteilungsübersicht des Marktes —
29 Abteilungen mit Bild, darunter Unterabteilungen (17 allein beim Gemüse),
darunter die Produkte. Wer den Suchbegriff kennt, tippt ihn stattdessen
oben ein.

Die Zutat merkt sich dann Anbieter und Artikel-ID. Beim Bauen der
Einkaufsliste wird für diese Zutat weder übersetzt noch gesucht — nur der
Preis frisch geholt.

Das Rezept bleibt trotzdem über Name und Menge definiert, das gewählte
Produkt ist nur eine Notiz dazu. Ein Rezept aus reinen Artikelnummern wäre
beim Supermarktwechsel wertlos, und die späteren Text- und Foto-Importe
liefern ohnehin Namen. Fällt ein Artikel aus dem Sortiment, sucht die App
automatisch Ersatz und vermerkt das in der Zeile.

Was das bringt, am Beispiel Spaghetti Bolognese:

| Zutat | automatisch | fest gewählt |
|---|---|---|
| Hackfleisch | 2 × 300 g — 8,50 € | 1 × 500 g — 4,59 € |
| Parmesan | ca. 145 g — 6,59 € | 150 g — 5,19 € |
| **Gesamt** | **21,95 €** | **16,64 €** |

## Wie gut trifft die automatische Zuordnung?

Für alles, was *nicht* fest gewählt wurde, greift die Heuristik. Ehrliche
Antwort dazu: **brauchbar, aber nicht gut genug.** Sie läuft über ein
handgepflegtes DE→NL-Wörterbuch plus eine Relevanzprüfung.

Rein auf den Preis zu optimieren scheitert sofort. Die Suche nach `eieren`
liefert flüssiges Eiweiß und Erdbeeren, `tomaten` liefert Ketchup und
Passata — alles billiger als das gemeinte Produkt. AHs eigene
Trefferreihenfolge hilft nicht: Sie setzt Ketchup auf Platz 2 von `tomaten`
und Erdbeeren auf Platz 5 von `eieren`.

Die Heuristik verlangt deshalb, dass der Suchbegriff im Produkttitel
vorkommt, und bevorzugt den Titel mit den wenigsten Zusatzwörtern —
`AH Tomaten` schlägt `AH Tomaten passata gezeefd`. Erst danach entscheidet
der Preis.

Was das nicht kann, und zwar prinzipiell nicht:

- **Mengen gegen Gebinde denken.** „3 Eier" trifft auf ein 3er-Pack à 10 Stück.
  Eine Wortzählung erkennt das nicht.
- **Gleichwertige Varianten erkennen.** `AH Patent tarwebloem` (500 g, 0,55 €)
  ist genauso richtig wie `AH Tarwebloem` (1 kg, 0,85 €), wird aber wegen
  eines Zusatzworts aussortiert — die Liste wird unnötig teurer.
- **Unbekannte Zutaten.** Was nicht im Wörterbuch steht, geht unübersetzt in
  die Suche.

Die belastbare Lösung ist die semantische Zuordnung über die Claude API in
Sprint 6/7. Die Heuristik ist explizit eine Brücke bis dahin.

## Aufbau

Zwei Teile, zwei Prozesse:

```
server/          Backend — HTTP-API und SQLite-Datenbank
  db.ts          Schema und Datenzugriff
  api.ts         Routen
  index.ts       Einstiegspunkt
  data/          die Datenbankdatei (nicht im Repo)
src/             Frontend — die App
  api/client.ts  spricht mit dem Backend
```

Die Daten liegen in **einer SQLite-Datei** unter `server/data/grocify.db`.
Das ist eine echte relationale Datenbank — Rezepte, Zutaten und Wochenplan
liegen in getrennten Tabellen mit Fremdschlüsseln. Sie läuft über
`node:sqlite`, das seit Node 22.5 eingebaut ist: **keine externe
Abhängigkeit, keine native Kompilierung, kein Datenbankdienst, kein
Docker.**

## Setup

Voraussetzung: Node 22.5+ (getestet mit Node 24) — ältere Versionen haben
`node:sqlite` noch nicht.

```bash
npm install
```

Dann **zwei Terminals**:

```bash
npm run server     # Terminal 1 — Backend auf Port 4000
npm run web        # Terminal 2 — App auf Port 8081/8082
```

Läuft das Backend nicht, sagt die App das beim Start deutlich und bietet
einen Wiederholen-Knopf — statt einen leeren Bildschirm zu zeigen.

```bash
npm run smoke:api    # Backend Ende zu Ende (eigene Wegwerf-Datenbank)
npm run smoke        # Albert-Heijn-Anbindung
npm run smoke:parse  # Zutaten-Parser
npm run typecheck    # TypeScript prüfen
```

### Die API

| Route | Zweck |
|---|---|
| `GET /api/health` | Läuft der Server, und was steht drin? |
| `GET /api/recipes` | Alle Rezepte samt Zutaten |
| `PUT /api/recipes/:id` | Anlegen oder ändern |
| `DELETE /api/recipes/:id` | Löschen — räumt auch den Wochenplan auf |
| `GET /api/week-plan` | Der Wochenplan |
| `PUT /api/week-plan` | Wochenplan speichern |

`npm run web` startet den Dev-Server auf http://localhost:8081 und öffnet den
Browser. Ist der Port belegt, weicht Expo auf 8082 aus — im nicht-interaktiven
Modus bricht es dabei allerdings ab, dann explizit starten:

```bash
npx expo start --web --port 8082
```

### Später: dieselbe Codebasis auf dem iPhone

Es ist **eine** Codebasis. Der Web-Weg ersetzt iOS nicht, er kommt daneben.
Sobald du willst:

```bash
npm start   # QR-Code mit der iPhone-Kamera scannen, Expo Go öffnet die App
```

Voraussetzung: **Expo Go** aus dem App Store, Rechner und iPhone im selben
WLAN. Kein Mac, kein Apple-Developer-Account, keine Kosten.

> **Warum SDK 54 und nicht das neueste?**
> Expo Go ist auf dem iPhone nur noch bis SDK 54 frei aus dem App Store
> verfügbar; für neuere SDKs braucht es einen kostenpflichtigen
> Apple-Developer-Account (99 €/Jahr). Das Projekt ist deshalb bewusst auf
> SDK 54 gepinnt. Ein Upgrade ist die bewusste Entscheidung, die zusammen
> mit dem Developer-Account fällt — nicht vorher.

### CORS

Der Browser darf `api.ah.nl` direkt aufrufen: AH beantwortet den Preflight
mit `Access-Control-Allow-Origin` und spiegelt die Origin zurück (geprüft
08/2026). Es braucht deshalb **keinen Proxy und kein Backend** für die
Produktsuche. Sollte AH das ändern, ist die Lösung eine Serverless-Funktion,
die die Anfrage weiterreicht — der Eingriff bleibt auf `albertHeijn.ts`
beschränkt.

## Struktur

```
server/               Backend — eigener Prozess
  db.ts               SQLite-Schema und Datenzugriff
  api.ts              HTTP-Routen
  chefkoch.ts         Rezept-Import
  index.ts            Einstiegspunkt
src/
  domain/             Reine Logik — kein Netzwerk, keine UI, voll testbar
    units.ts          Einheiten (g, ml, EL, TL, Prise, Bund …) und Umrechnung
    types.ts          Ingredient, Recipe, Product, ShoppingList, Kennzahlen
    translate.ts      DE→NL-Zutatenwörterbuch, Vorratsware-Erkennung
    parseIngredient.ts  Freitext („Milch 0,5 l") in Menge + Einheit + Name
    shoppingList.ts   Zutaten zusammenfassen, Produkte wählen, Preise rechnen
    weekPlan.ts       Wochenplan — Tage, Gerichte, Kennzahlen
    leftoverUse.ts    Welches Rezept verbraucht die Reste?
  supermarkets/
    types.ts          PriceProvider-Interface — Abstraktion über Datenquellen
    albertHeijn.ts    Albert-Heijn-Anbindung
    jumbo.ts          Jumbo — nicht verfügbar, dokumentiert warum
    registry.ts       Verzeichnis der Anbieter
  api/client.ts       spricht mit dem Backend
  screens/            Die Schritte des Ablaufs
  ui/                 Theme, Kees, Sonnenblume, Bewegung
scripts/              Messwerkzeuge, siehe unten
landing/              Landingpage (statisch, ohne Build) — Spec in DESIGN.md
App.tsx               Navigation
```

Es gibt **kein** `src/storage/` mehr. Rezepte lagen früher im Browserspeicher;
seit der Umstellung auf das Backend liegen sie in der Datenbankdatei.

## Datenquellen

| Markt | Stand | Anmerkung |
|---|---|---|
| **Albert Heijn** | funktioniert | Anonymer Token ohne Account, Produktsuche, Preise, Aktionen, Abteilungen |
| **Jumbo** | abgeschaltet | `mobileapi.jumbo.com` antwortet auf alles mit **404** (geprüft 14.08.2026) |
| **Chefkoch** | funktioniert | Rezept-Import über das App-Backend, keine offizielle API |

Bei Jumbo ist die Veränderung aufschlussreich: Am 11.08. kam noch ein **403**,
drei Tage später ein **404**. „Du darfst nicht" wurde zu „hier ist nichts mehr".
Zwei Wege existieren technisch noch — die interne GraphQL-Schnittstelle der
Website und deren HTML —, beide sind bewusst nicht gegangen: Die eine verlangt
das Umgehen eines CSRF-Schutzes, die andere ist in `robots.txt` ausdrücklich
für die Produktsuche gesperrt. Details stehen im Kopf von `src/supermarkets/jumbo.ts`.

⚠️ **Wichtig:** Die AH-Anbindung nutzt das interne Mobile-Backend der
Appie-App. Das ist **keine offizielle, lizenzierte API** — es gibt keine
Nutzungszusage und keine Verfügbarkeitsgarantie, und AH kann sie jederzeit
abschalten. Jumbo hat genau das bereits getan.

Für Entwicklung und private Nutzung ist das unproblematisch. Bevor daraus
ein veröffentlichtes Produkt wird, muss die Datenquelle auf eine
Partnerschaft oder einen kommerziellen Anbieter umgestellt werden. Genau
dafür existiert das `PriceProvider`-Interface: Der Wechsel ist ein
Klassentausch, kein Umbau der App.

## Bewusste Entwurfsentscheidungen

- **Mehrdeutige Einheiten werden nicht geraten.** „1 Bund Petersilie" (≈ 30 g)
  und „1 Bund Möhren" (≈ 500 g) sind beides „1 Bund". `toBase()` gibt für
  solche Einheiten `null` zurück statt eines stillen Durchschnittswerts —
  falsche Einkaufsmengen sind schlimmer als eine Rückfrage.
- **Bedarf ≠ Kaufmenge.** Das Rezept braucht 200 g Mehl, die Packung hat 1 kg.
  `ShoppingListItem` führt beides getrennt.
- **Deutsch rein, Niederländisch raus.** Rezepte sind deutsch, Produkte
  niederländisch. „Weizenmehl" → `tarwebloem` ist Produktkunde, keine
  Übersetzung — `Ingredient.searchTermNl` hält die Brücke.
- **Zubereitungstexte werden nicht serverseitig gespeichert.** Zutatenlisten
  sind in der Regel nicht urheberrechtlich geschützt, Zubereitungstexte schon.

## Roadmap

| Sprint | Inhalt | Status |
|---|---|---|
| 0 | Projektgerüst, AH-Durchstich | ✅ |
| 1 | Domänenkern: Einheiten, Typen | ✅ — 172 Tests, siehe unten |
| 2 | Screens: Rezepte, Supermarkt, Einkaufsliste | ✅ |
| 3 | Rezept-Parsing (Freitext, ohne LLM) | ✅ — `parseIngredient.ts`, 24 Fälle |
| 3b | Rezept-Import von Chefkoch | ✅ |
| 4 | Import per Link (schema.org/Recipe JSON-LD) | offen |
| 5 | Import per Foto (Claude Vision) | offen |
| 6 | Zutaten-Normalisierung per LLM statt Wörterbuch | offen |
| 7 | Produkt-Matching per LLM statt Wortzählung | offen |
| 8 | Einkaufsliste verfeinern (Produkt tauschen, Mengen anpassen) | ✅ |
| 9 | Persistenz | ✅ — SQLite über `node:sqlite`, eigenes Backend |
| 10 | Wochenplan, Verwertungsquote, Restenutzung | ✅ |
| 11 | Landingpage | ✅ — `landing/`, Spec in `DESIGN.md` |
| 12 | Build, Release | offen |

### Tests

```bash
npm test        # 172 Tests, kein Netzwerk, unter zwei Sekunden
```

Läuft über `node:test` — in Node eingebaut, keine neue Abhängigkeit.

Der Anlass: `shoppingList.ts` — die Produktauswahl — wurde mehrfach von Hand
nachjustiert, zuletzt mit dem Rückfall aufs Grundwort („hokkaido pompoen" →
„pompoen"). Kontrolliert wurde jedes Mal nur, indem `npm run try:week` lief und
die Summe mit der vorherigen verglichen wurde. Das ist eine Messung gegen ein
Sortiment, dessen Preise sich täglich ändern — sie zeigt, dass die Summe gleich
blieb, nicht dass die Regeln stimmen.

Die Tests laufen deshalb gegen **erfundene Produkte mit festen Preisen**. Jeder
Fall bildet eine Fehlzuordnung ab, die tatsächlich vorkam: Ketchup statt
Tomaten, Kürbisbrötchen statt Kürbis, `AH Tomaten passata gezeefd` statt
`AH Tomaten`.

| Datei | Tests | Schwerpunkt |
|---|---|---|
| `units.test.ts` | 24 | Umrechnung — und dass „1 Bund" `null` ergibt statt eines geratenen Werts |
| `parseIngredient.test.ts` | 29 | die Schreibweisen, die Menschen wirklich tippen |
| `shoppingList.test.ts` | 16 | Produktwahl und Zusammenfassung, jeder Fall ein echter Fehler |
| `translate.test.ts` | 15 | Nachschlage-Regeln, Umlaute, Wörterbuch als Datenbestand |
| `weekPlan.test.ts` | 13 | dass **nicht** dedupliziert wird — zweimal geplant heißt zweimal einkaufen |
| `stats.test.ts` | 18 | Verwertung nach Geld gewichtet, nicht nach Zeilen |
| `db.test.ts` | 15 | `ON DELETE CASCADE` — gelöschtes Rezept verlässt den Wochenplan |
| `api.test.ts` | 25 | Eingabeprüfung: was das Backend ablehnen muss |
| `chefkoch.test.ts` | 17 | Pluralklammern, „nach Geschmack", Trennzeilen |

Kein Test braucht Netzwerk. `db` und `api` bekommen je eine Wegwerf-Datenbank
im temporären Ordner, `api` einen freien Port über `listen(0)`, und `chefkoch`
eine `fetch`-Attrappe. Was echtes Netzwerk braucht, bleibt in den
Messwerkzeugen unten.

Zwei Tests haben beim ersten Lauf etwas gezeigt — beide über die Tests, nicht
über den Code: `scale()` wirft bei 0 Portionen bereits einen expliziten Fehler
(ich hatte stilles `Infinity` erwartet), und `saveWeekPlan` ersetzt den ganzen
Plan statt ihn zu ergänzen — richtig so, es ist ein PUT. Beide Male wurde die
Erwartung angepasst, nicht das Verhalten.

### Messwerkzeuge

| Befehl | Was er misst |
|---|---|
| `npm test` | 172 Tests über Domäne und Backend, ohne Netzwerk |
| `npm run typecheck` | TypeScript |
| `npm run smoke` | Albert-Heijn-Anbindung |
| `npm run smoke:api` | Backend Ende zu Ende (eigene Wegwerf-Datenbank) |
| `npm run smoke:parse` | Zutaten-Parser, 24 Fälle |
| `npm run smoke:list` | Einkaufslisten-Logik gegen echte Preise |
| `npm run check:dict` | jeden Wörterbucheintrag gegen den echten Katalog |
| `npm run try:week` | Wochenplan: Ersparnis, Verwertung, Preis je Portion |
| `npm run try:import` | Chefkoch-Import bis zum fertigen Preis |
