# Grocify

Rezept rein, smarte Einkaufsliste raus — mit echten Preisen aus dem
niederländischen Supermarktsortiment.

Der Nutzer gibt ein Rezept ein (Text, Link oder Foto), die App extrahiert
Zutaten und Mengen, ordnet ihnen konkrete Produkte zu und berechnet den
Gesamtpreis des Einkaufs.

## Stand

**Sprint 0 abgeschlossen** — Durchstich steht: Die App erreicht über den
`PriceProvider` echte Albert-Heijn-Preise. Rezept-Parsing, Zutaten-
Normalisierung und Einkaufsliste kommen in Sprint 3–8.

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
  domain/           Reine Logik — kein Netzwerk, keine UI, voll testbar
    units.ts        Einheiten (g, ml, EL, TL, Prise, Bund …) und Umrechnung
    types.ts        Ingredient, Recipe, Product, ShoppingList
  supermarkets/
    types.ts        PriceProvider-Interface — die Abstraktion über Datenquellen
    albertHeijn.ts  Albert-Heijn-Anbindung
scripts/
  smoke-ah.ts       Smoke-Test der Datenquelle
App.tsx             Sprint-0-Durchstich: Produktsuche mit echten Preisen
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
| 1 | Domänenkern: Einheiten, Typen, Tests | teilweise |
| 2 | UI-Skelett mit Mock-Daten | offen |
| 3 | Rezept-Parsing (Text) via Claude API | offen |
| 4 | Import per Link (schema.org/Recipe JSON-LD) | offen |
| 5 | Import per Foto (Claude Vision) | offen |
| 6 | Zutaten-Normalisierung + DE→NL-Abbildung | offen |
| 7 | Produkt-Matching, Packungsgrößen, Preise | offen |
| 8 | Einkaufsliste, sortiert nach Ladenabteilung | offen |
| 9 | Persistenz (expo-sqlite) | offen |
| 10 | Build, Release | offen |
