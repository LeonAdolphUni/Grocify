# Grocify

Rezept rein, smarte Einkaufsliste raus — mit echten Preisen aus dem
niederländischen Supermarktsortiment.

Der Nutzer gibt ein Rezept ein (Text, Link oder Foto), die App extrahiert
Zutaten und Mengen, ordnet ihnen konkrete Produkte zu und berechnet den
Gesamtpreis des Einkaufs.

## Stand

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
| 2 | `SupermarketScreen` | Albert Heijn oder Jumbo. Nicht verfügbare Märkte werden mit Begründung angezeigt, nicht versteckt |
| 3 | `ShoppingListScreen` | Zutaten zusammenfassen, Produkte suchen, Packungen berechnen, Preise summieren |

## Wie gut trifft die Produktzuordnung?

Ehrliche Antwort: **brauchbar, aber nicht gut genug.** Die Zuordnung läuft
über ein handgepflegtes DE→NL-Wörterbuch plus eine Relevanzheuristik.

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

## Setup

Voraussetzung: Node 20+ (getestet mit Node 24).

```bash
npm install
npm run web        # Web-App im Browser — der aktuelle Hauptweg
npm run smoke      # Albert-Heijn-Anbindung ohne App/Browser testen
npm run typecheck  # TypeScript prüfen
```

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
