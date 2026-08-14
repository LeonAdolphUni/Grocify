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

Rezepte werden derzeit von Hand eingetragen. Der Import aus Text, Link und
Foto über die Claude API folgt in Sprint 3–5.

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
src/
  domain/             Reine Logik — kein Netzwerk, keine UI, voll testbar
    units.ts          Einheiten (g, ml, EL, TL, Prise, Bund …) und Umrechnung
    types.ts          Ingredient, Recipe, Product, ShoppingList
    translate.ts      DE→NL-Zutatenwörterbuch, Vorratsware-Erkennung
    shoppingList.ts   Zutaten zusammenfassen, Produkte wählen, Preise rechnen
  supermarkets/
    types.ts          PriceProvider-Interface — Abstraktion über Datenquellen
    albertHeijn.ts    Albert-Heijn-Anbindung
    jumbo.ts          Jumbo — derzeit nicht verfügbar, dokumentiert warum
    registry.ts       Verzeichnis der Anbieter
  storage/
    recipeStore.ts    Rezepte speichern (AsyncStorage: Browser + Gerät)
  screens/            Die vier Schritte des Ablaufs
  ui/                 Theme und wiederverwendete Bausteine
scripts/
  smoke-ah.ts         Datenquelle testen
  smoke-list.ts       Einkaufslisten-Logik gegen echte Daten testen
App.tsx               Navigation
```

## Datenquellen

| Markt | Stand | Anmerkung |
|---|---|---|
| **Albert Heijn** | funktioniert | Anonymer Token ohne Account, Produktsuche, Preise, Aktionen, Abteilungen |
| **Jumbo** | blockiert | Antwortet mit HTTP 403 / Timeout (geprüft 08/2026) |

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
| 1 | Domänenkern: Einheiten, Typen | ✅ (Tests fehlen noch) |
| 2 | Screens: Rezepte, Supermarkt, Einkaufsliste | ✅ |
| 3 | Rezept-Parsing (Text) via Claude API | offen |
| 4 | Import per Link (schema.org/Recipe JSON-LD) | offen |
| 5 | Import per Foto (Claude Vision) | offen |
| 6 | Zutaten-Normalisierung per LLM statt Wörterbuch | offen |
| 7 | Produkt-Matching per LLM statt Wortzählung | offen |
| 8 | Einkaufsliste verfeinern (Produkt tauschen, Mengen anpassen) | ✅ Grundlage steht |
| 9 | Persistenz | ✅ (AsyncStorage; SQLite bei Bedarf) |
| 10 | Build, Release | offen |
