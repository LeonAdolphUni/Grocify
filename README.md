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
holst sie dir **aus Albert Heijns Allerhande** ins eigene Buch.

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
  allerhande.ts       Rezept-Import aus Albert Heijns Allerhande
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
| **Allerhande** | funktioniert | Rezept-Import über das schema.org-JSON-LD der Rezeptseiten |

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

## Rezepte von Albert Heijn statt aus Deutschland

Der Import holt Rezepte aus **Allerhande**, Albert Heijns eigenem
Rezeptportal. Das ist keine Geschmacksfrage, sondern behebt die größte
Fehlerquelle der App.

Ein deutsches Rezept muss übersetzt werden, bevor man es im niederländischen
Regal suchen kann: „Schmand" → `creme fraiche`, „Hühnerbrühe" → `bouillon`.
Dafür brauchte es ein Wörterbuch mit hundert Einträgen, eine
Kompositum-Zerlegung, einen Rückfall aufs Grundwort — und am Ende fanden
trotzdem Zutaten nichts.

**Allerhande-Zutaten sind schon die Produktnamen.** „300 g biologische
volkorenpenne" ist kein Übersetzungsproblem, sondern ein Suchbegriff. Was
importiert wird, gibt es im Laden.

Gemessen an fünf echten Rezepten, 50 Zutaten:

| Rezept | Positionen | zugeordnet |
|---|---|---|
| Romige green goddess-pasta | 11 | 91 % |
| Tagliatelle met ricotta-tomatensaus | 12 | 83 % |
| Maissoep met kipgehaktballetjes | 8 | 88 % |
| Couscoussalade met yoghurtdressing | 9 | **100 %** |
| Gevuld flatbread met vegan shoarma | 10 | 80 % |
| **Gesamt** | **50** | **88 %** |

Dazu liefert Allerhande **eigene Nährwerte je Portion** — keine Schätzung
aus der Durchschnittstabelle mehr, sondern AHs Angabe.

Gelesen wird das schema.org-`Recipe`-JSON-LD der Rezeptseiten. Das ist
strukturierte Auszeichnung, die AH ausdrücklich für Maschinen
veröffentlicht: Ihre `robots.txt` nennt eine eigene Sitemap für Rezepte und
vermerkt „ALLERHANDE OPTIMALISATIE — Minder restrictief voor SEO". Gesperrt
sind Nutzerbereiche und Mehrfachfilter (`/allerhande/*?*&*`), nicht die
Rezepte — deshalb nutzt die Suche bewusst **genau einen** Abfrageparameter.

Das deutsche Wörterbuch bleibt: Es gilt weiterhin für selbst angelegte
Rezepte, die man auf Deutsch eintippt.

## Suchen und Stöbern

Der Rezeptbildschirm hat zwei Reiter, weil es zwei Absichten sind: **Suchen**
(du weißt, was du willst) und **Stöbern** (du weißt es nicht). Ein Suchfeld
allein bedient nur die erste — wer nicht weiß, wonach er suchen soll, steht
davor wie vor einer leeren Seite.

Der Katalog ordnet 21 geprüfte Kategorien in vier Gruppen: Gerichte, Küchen,
Art, Ernährung. Geprüft heißt geprüft: Von 32 vermuteten Kategorie-Adressen
lieferten nur diese 21 tatsächlich Rezepte. „vlees", „vis" und „ontbijt" gibt
es als Seite gar nicht, „wraps" und „risotto" antworten mit 403. Eine
Kategorie, die ins Leere führt, ist schlimmer als eine fehlende.

### Die Suche übersetzt

Allerhande ist niederländisch. Wer „Eiersalat" eingibt, sucht dort nach einem
Wort, das es nicht gibt. Einstellbar ist **Deutsch, Nederlands, English**;
der Begriff wird vor der Suche übersetzt, und die Übersetzung steht sichtbar
unter dem Feld — wer „Eiersalat" tippt und Ergebnisse zu „eiersalade"
bekommt, soll den Grund sehen.

| Eingabe | wird gesucht als |
|---|---|
| Eiersalat | `eiersalade` |
| Kürbissuppe | `pompoensoep` |
| Hähnchen | `kip` |
| Krabbensalat | `krabbensalade` |
| egg salad | `eiersalade` |
| chicken soup | `kip soep` |

Die letzten Fälle zeigen den Trick: „Kürbissuppe" steht in keiner Tabelle.
Deutsch und Niederländisch sind nah verwandt, also wird „-suppe" zu „-soep"
und der Stamm getrennt nachgeschlagen. Das greift auch bei Wörtern, die
niemand eingetragen hat.

## Der Gericht-Finder

Der Planer durchsucht **Allerhande**, nicht das eigene Rezeptbuch. Nur im
eigenen Buch zu suchen wäre ein Kreis: Man kann planen, was man schon hat,
und wer acht Rezepte besitzt, bekommt achtmal dieselbe Woche.

Er ist ein **Finder**, kein Wochenplaner: Als Planer musste er eine ganze
Woche auf einmal füllen und scheiterte, sobald die Filter streng waren — ein
Lauf mit „7 Gerichte, 20 Min, 2 €" lieferte **ein** Gericht. Als Finder
beantwortet er die Frage, die man sich abends wirklich stellt: „Was koche
ich?"

Der Ablauf ist ein **Formular**: Wünsche, Anzahl Mahlzeiten, Budget je
Mahlzeit, schnell oder in Ruhe, vegetarisch ja/nein. Dazu ein zweiter Knopf,
**„Vorrat aufbrauchen"** — der dreht die Suchrichtung um: Nicht der Wunsch
bestimmt, wonach gesucht wird, sondern die ältesten Einträge im Vorrat.

**„Schnell" heißt 15 Minuten** und ist mehr als ein Zeitfilter. Die meisten
Allerhande-Rezepte liegen bei 30 bis 40 Minuten; ein scharfer Filter fände
fast nichts. Deshalb wird zusätzlich aus AHs eigener Auswahl schneller
Rezepte geschöpft (`snelle-recepten`, geprüft: 9 Rezepte). Jeder Vorschlag trägt seine Begründung
— eine Liste ohne Begründung müsste man glauben, diese kann man prüfen.

**Vorher war es ein Chat, und das war die schlechtere Idee.** Ein Gespräch
stellt immer nur eine Frage auf einmal; Budget, Tage und Zeit kamen dabei nie
zur Sprache. Der erste echte Durchlauf lieferte deshalb eine Woche, die zu
teuer war, ohne dass sich sagen ließ, woran es lag. Ein Formular zeigt alle
Stellschrauben nebeneinander.

### Was beim ersten Testlauf schiefging

Gemessen an einem echten Vorschlag — 41,36 € für vier Gerichte bei **7 %
Verwertung**. Drei Ursachen, keine davon die vermutete:

| Befund | Ursache | Behebung |
|---|---|---|
| Yoghurtbars als Abendessen | „Gesunde Rezepte" enthält Snacks und Riegel | Filter auf AHs `recipeCategory`, Sperrliste für Snacks und Nachtische |
| Rezepte für 8–12 Portionen | Auf eine Person gerechnet bleibt ein Zwölftel Glas Honig | Höchstens **6 Portionen** |
| 7,29 € Honig, 3,29 € Erdnussbutter | `isPantryStaple` kannte nur deutsche Namen | Niederländische Vorratsware, inkl. Gläser und Trockengewürze |

Dazu ein vierter Punkt, der erst beim Nachmessen auffiel: Der Preis war **gar
kein Kriterium**. Die Zutatenzahl stand als Stellvertreter dafür, mit der
Begründung, echte Preise kosteten zu viele Anfragen. Das war falsch — die
Rezeptseiten liegen auf `www.ah.nl` und sind gedrosselt, die Produktsuche
läuft über `api.ah.nl` und ist es nicht.

### Mahlzeiten, nicht Gerichte

**Der teuerste Fehler saß im Modell, nicht im Code.** Ein Lauf mit „7
Gerichte, hoechstens 20 Min, hoechstens 2 €" lieferte **ein** Gericht fuer
12,38 € bei **14 % Verwertung**. Man kauft eine ganze Packung Hackfleisch,
eine ganze Packung Fusilli, eine ganze Sauce — und isst ein Viertel davon.

Ein Rezept fuer vier Portionen ist fuer eine Person kein Abendessen,
sondern **vier**: einmal kochen, viermal essen. Der Planer rechnet deshalb
nicht mehr auf eine Portion herunter, sondern kocht in voller Groesse und
zaehlt die Portionen als Mahlzeiten. Derselbe Lauf, live gemessen:

| | vorher | nachher |
|---|---|---|
| Einkauf | 12,38 € | 15,94 € |
| Mahlzeiten | 1 | **8** |
| je Mahlzeit | 12,38 € | **1,99 €** |
| verkocht | 14 % | **95 %** |

Im Wochenplan steht jedes Rezept trotzdem nur **einmal**, auf dem Kochtag.
`recipesInPlan` dedupliziert bewusst nicht — zweimal geplant heisst zweimal
einkaufen —, vier Eintraege wuerden also den vierfachen Einkauf erzeugen.

Der Preis je Mahlzeit ist seither **Einkauf geteilt durch Portionen**, ohne
Abzug fuer Reste. Eine Zwischenfassung zog den Restwert ab, damit die
1-Portionen-Rechnung nicht absurd wurde (sie ergab 42,98 € je Portion). Das
war ein perverser Anreiz: Es belohnte genau die Gerichte, die viel uebrig
lassen. Beim Vollkochen braucht es den Kniff nicht mehr.

### Der stumme Ausfall der Vorratsfunktion

**Der schwerste bisher gefundene Fehler in diesem Projekt, und er stand
nirgends.** Seit die Rezepte aus Allerhande kommen, stehen ihre Zutaten auf
Niederländisch. Der Vorrat steht in der Sprache, in der der Nutzer tippt.
Verglichen wurden die Namen — und „Reis" gegen „rijst", „Zwiebel" gegen
„ui", „Käse" gegen „kaas" sind unähnlich. Gemessen wurde **gar nichts** mehr
abgezogen, außer bei Zufallstreffern wie „Paprika"/„paprika". Die
Einkaufsliste kaufte alles doppelt, ohne dass irgendwo eine Warnung stand.

Verglichen wird jetzt zusätzlich über die Suchübersetzung, in beide
Richtungen — und über die niederländische Grammatik, denn allein die
Übersetzung reichte nicht:

| im Rezept | im Vorrat | was fehlte |
|---|---|---|
| `rode paprika's` | Paprika | Beiwort davor, Apostroph-Plural |
| `uien` | Zwiebeln | niederländischer Plural von „ui" |
| `zilvervliesrijst` | Reis | Kompositum — der Kopf steht hinten |

Drei Fallen mussten dabei ausdrücklich abgesichert werden, jede mit Test:

- **„aardappelen" endet auf „appelen".** Ohne Sperre gälten Kartoffeln als
  von Äpfeln gedeckt.
- **„zoete aardappelen" sind keine Kartoffeln.** Beiwörter werden nur
  gestrichen, wenn sie Farbe oder Größe nennen — „zoete", „gedroogde" und
  „gerookte" ändern die Zutat und bleiben stehen.
- **„Eis" ist kein Plural von „Ei".** Die niederländische `-s`-Regel darf
  nicht auf deutsche Wörter durchschlagen; die Mindestlänge gilt deshalb je
  Endung, damit `uien` → `ui` erlaubt bleibt und `Eis` → `Ei` nicht.

Gemessen an einem echten Lauf mit Reis, Zwiebeln und Paprika im Vorrat:
Vorratsdeckung **0 % → 20 %**, Preis **3,36 € → 2,84 €** je Mahlzeit.

### Weiche und harte Grenzen

Zeit und Budget sind **weich**. Reicht es nicht, wird stufenweise gelockert
— erst die Zeit, dann das Geld —, und im Ergebnis steht, was nachgegeben
hat. Zwanzig Minuten sind bei Allerhande hart: Die meisten Rezepte liegen
bei 30 bis 40, im gemessenen Lauf fielen 19 von 20 Kandidaten den Filtern
zum Opfer. Ein einzelnes Gericht ist keine Antwort auf „plan mir die Woche".

**Vegetarisch wird nie gelockert.** Zeit und Geld sind Wuensche, eine
Ernaehrungsweise ist keiner.

### Anfragen sind gedrosselt

Beim Entwickeln haben schnell aufeinanderfolgende Aufrufe ein **HTTP 403**
ausgelöst. AH schützt sich gegen Lastspitzen, zu Recht: Ein Import, der zehn
Seiten in einer Sekunde zieht, verhält sich wie ein Scraper. Zwischen zwei
Anfragen liegt deshalb mindestens **eine Sekunde**, und bei 403, 429 oder 503
wird einmal gewartet und erneut versucht — nicht in einer Schleife, das wäre
genau das Verhalten, gegen das sich die Sperre richtet.

**503 kam durch Messen dazu.** Nach ausgiebigem Sondieren antwortete AH
minutenlang mit 503 statt 403 — dieselbe Drosselung, anderer Code. Die
Preisabfragen laufen aus demselben Grund höchstens **drei gleichzeitig**: Ein
Schwall von hundert parallelen Verbindungen hat Nodes HTTP-Schicht zum
Absturz gebracht.

Ein Wochenplan-Vorschlag holt neun bis zwanzig Rezeptseiten und dauert
entsprechend **zehn bis zwanzig Sekunden**. Das steht auch in der App.

## Bilder von Albert Heijn

Rezepte zeigen das Foto von AHs Bildserver — in der Trefferliste, im
Wochenplan und auf der Rezeptseite. Geladen wird **direkt von dort**, nichts
wird kopiert: Zieht AH ein Rezept zurück, verschwindet auch sein Bild.

Die Adresse steht an zwei Stellen, und beide werden gelesen. Im JSON-LD des
Rezepts unter `image` — dort ist der **erste Eintrag ein leerer String**, wer
`[0]` nimmt, zeigt nie ein Bild. Und in der Trefferliste, wo AH sie mal nackt
ausliefert und mal prozentkodiert in einem `url=`-Parameter der
Next.js-Bildoptimierung.

Beim Zuordnen in der Trefferliste wird nur **vorwärts bis zum schließenden
`</a>`** gesucht. Ein größeres Fenster fände mehr Bilder und ordnete manche
dem falschen Gericht zu — und ein falsches Bild ist schlimmer als gar keins.
Fehlt eins, steht das Monogramm da, wie bisher.

## Portionen: für eine Person gerechnet

Grocify ist für **eine Person** gebaut, Rezepte sind es nie — Allerhande
liefert vier bis acht Portionen. Jedes Rezept wird deshalb beim *Benutzen*
auf die eingestellte Portionszahl umgerechnet (Standard: 1). Das Original
bleibt in der Datenbank unangetastet, samt Herkunftsangabe.

**Das hat einen messbaren Preis.** Derselbe Wochenplan, dreimal gerechnet:

| Portionen | Einkauf | Verwertung | je Portion |
|---|---|---|---|
| 1 | 29,20 € | **40 %** | 4,17 € |
| 2 | 29,90 € | 63 % | 2,14 € |
| 4 | 40,17 € | 85 % | 1,43 € |

Packungen lassen sich nicht vierteln: Ein halbes Ei kann man nicht kaufen,
ein Sechstel Kürbis auch nicht. Je kleiner man rechnet, desto mehr bleibt
liegen. Von 1 auf 2 Portionen kostet **70 Cent mehr** und halbiert den
Preis je Portion — deshalb ist die Zahl einstellbar und der Hinweis steht
auf dem Startbildschirm, statt versteckt zu sein.

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
| 1 | Domänenkern: Einheiten, Typen | ✅ — 193 Tests, siehe unten |
| 2 | Screens: Rezepte, Supermarkt, Einkaufsliste | ✅ |
| 3 | Rezept-Parsing (Freitext, ohne LLM) | ✅ — `parseIngredient.ts`, 24 Fälle |
| 3b | Rezept-Import von Albert Heijn Allerhande | ✅ |
| 4 | Import per Link (schema.org/Recipe JSON-LD) | offen |
| 5 | Import per Foto (Claude Vision) | offen |
| 6 | Zutaten-Normalisierung per LLM statt Wörterbuch | offen |
| 7 | Produkt-Matching per LLM statt Wortzählung | offen |
| 8 | Einkaufsliste verfeinern (Produkt tauschen, Mengen anpassen) | ✅ |
| 9 | Persistenz | ✅ — SQLite über `node:sqlite`, eigenes Backend |
| 10 | Wochenplan, Verwertungsquote, Restenutzung | ✅ |
| 11 | Landingpage | ✅ — `landing/`, Spec in `DESIGN.md` |
| 12 | Sicherung und Umzug (`npm run backup` / `restore`) | ✅ |
| 13 | Build, Release | offen |

### Tests

```bash
npm test        # 193 Tests, kein Netzwerk
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
| `parseDutch.test.ts` | 34 | niederländische Einheiten, Verpackungsangaben |
| `backup.test.ts` | 21 | der ganze Kreis: Datenbank → JSON → **andere** Datenbank |
| `weekAdvisor.test.ts` | 25 | die Filter aus dem Testlauf — und dass „ham" nicht in „champignons" trifft |
| `allerhande.test.ts` | 14 | Bildadressen in drei Schreibweisen, niederländische Vorratsware |
| `migration.test.ts` | 5 | dass eine **bestehende** Datenbank das neue Schema übersteht |

Kein Test braucht Netzwerk. `db` und `api` bekommen je eine Wegwerf-Datenbank
im temporären Ordner, `api` einen freien Port über `listen(0)`, und `allerhande`
eine `fetch`-Attrappe. Was echtes Netzwerk braucht, bleibt in den
Messwerkzeugen unten.

Zwei Tests haben beim ersten Lauf etwas gezeigt — beide über die Tests, nicht
über den Code: `scale()` wirft bei 0 Portionen bereits einen expliziten Fehler
(ich hatte stilles `Infinity` erwartet), und `saveWeekPlan` ersetzt den ganzen
Plan statt ihn zu ergänzen — richtig so, es ist ein PUT. Beide Male wurde die
Erwartung angepasst, nicht das Verhalten.

### Sicherung

Die Datenbank liegt bewusst **nicht** im Repo — sie enthält deine Rezepte,
nicht den Code. Damit ist sie aber auch nur eine Datei auf einem Rechner:

```bash
npm run backup                                  # → server/data/backups/grocify-JJJJ-MM-TT-hhmm.json
npm run backup -- --out D:/Sicherung/rezepte.json
npm run restore -- server/data/backups/grocify-2026-08-15-1338.json
```

Gesichert wird als **lesbares JSON**, nicht als Kopie der `.db`-Datei. Eine
SQLite-Datei braucht SQLite und das passende Schema; die JSON-Datei kann man
in fünf Jahren mit jedem Texteditor öffnen und notfalls von Hand abtippen.
Es ist außerdem der Weg, die Rezepte auf einen anderen Rechner mitzunehmen.

**Was `restore` tut, im Klartext:** Rezepte werden nach ID angelegt oder
überschrieben — **nichts wird gelöscht**. Rezepte, die es nur in der Datenbank
gibt, bleiben unangetastet. Man holt eine Sicherung meist, weil etwas fehlt,
nicht weil zu viel da ist. Der Wochenplan wird ersetzt; er ist ein einzelner
Zustand, kein Bestand. Willst du exakt den gesicherten Stand und nichts sonst,
lösche vorher `server/data/grocify.db`.

### Messwerkzeuge

| Befehl | Was er misst |
|---|---|
| `npm test` | 193 Tests über Domäne, Backend und Sicherung, ohne Netzwerk |
| `npm run typecheck` | TypeScript |
| `npm run smoke` | Albert-Heijn-Anbindung |
| `npm run smoke:api` | Backend Ende zu Ende (eigene Wegwerf-Datenbank) |
| `npm run smoke:parse` | Zutaten-Parser, 24 Fälle |
| `npm run smoke:list` | Einkaufslisten-Logik gegen echte Preise |
| `npm run check:dict` | jeden Wörterbucheintrag gegen den echten Katalog |
| `npm run try:week` | Wochenplan: Ersparnis, Verwertung, Preis je Portion |
| `npm run try:allerhande` | Allerhande-Import bis zum fertigen Preis |
