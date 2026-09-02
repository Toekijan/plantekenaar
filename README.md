# PlanTekenaar

2D plattegrond-/kaarteditor in de browser (canvas-tekening, geen build-stap nodig).
Open `index.html` (bij voorkeur via een lokale webserver, i.v.m. `fetch`/module-restricties
van sommige browsers) om de app te gebruiken.

## Lokaal testen

```bash
python3 -m http.server 8765
# open http://localhost:8765/index.html
```

## Tests

De pure rekenmodules (`geometry.js`, `georeference.js`) zijn los te testen met Node,
zonder browser of dependencies:

```bash
node geometry.test.js
node georeference.test.js
```

## Georefereren op RD-coördinaten (EPSG:28992)

Met de knop **Georefereren** (in de toolbar, groep "Basis") kun je de tekening koppelen
aan echte RD-coördinaten (Rijksdriehoeksstelsel), zodat je continu weet waar je op de
tekening staat in het echte coördinatenstelsel — vergelijkbaar met de coördinaatweergave
in Google Maps.

### Hoe kalibreer je?

1. Klik op **Georefereren**.
2. Klik op de tekening op een punt waarvan je de echte RD-coördinaat kent (bijv. een
   kadastraal hoekpunt, een straatmeubilair-referentie, of een punt dat je eerder hebt
   opgemeten). Er verschijnt een klein invoervenster — vul de RD X- en Y-coördinaat in
   meters in (X ligt tussen 0 en 300.000, Y tussen 300.000 en 650.000) en bevestig met OK.
3. Herhaal dit voor in totaal 4 punten, bij voorkeur goed verspreid over de tekening
   (niet alle 4 dicht bij elkaar of vrijwel op één lijn — de app waarschuwt hiervoor).
4. Zodra er 3 of 4 punten zijn ingevuld, berekent de app automatisch een affiene
   transformatie (least-squares fit) tussen de tekening en het RD-stelsel. Met 4 punten
   wordt eventuele meetfout over de punten uitgemiddeld.
5. Rechts in het eigenschappenpaneel zie je per punt de residuele fout (het verschil
   tussen het ingevoerde RD-punt en wat de berekende transformatie voorspelt) en de
   gemiddelde RMS-fout. Bij een RMS boven de instelbare drempel (standaard 0,5 m)
   waarschuwt de app dat de kalibratie onnauwkeurig is — controleer dan de aangeklikte
   punten of de ingevoerde coördinaten.
6. Referentiepunten zijn achteraf te verplaatsen (sleep de marker), te bewerken (pas de
   RD X/Y-waarden in het paneel aan) of te verwijderen (✕-knop per punt, of selecteer een
   marker en druk op Delete).

### Live coördinaten

Zodra er een geldige kalibratie is (≥3 punten met RD-coördinaat), toont een overlay
linksonder in het canvas continu de RD-coördinaat onder de muisaanwijzer, plus een
schaalbalk. Vink **WGS84 tonen** aan om ook de breedte-/lengtegraad (decimale graden)
te zien — deze conversie gebruikt [proj4js](https://github.com/proj4js/proj4js) met de
officiële EPSG:28992-projectieparameters en de door het Kadaster gepubliceerde
RDNAP-Helmert-parameters (nauwkeurig tot op enkele centimeters).

**Ctrl+klik** op de tekening kopieert de RD-coördinaat (en WGS84, indien getoond) van dat
punt naar het klembord. Op touchapparaten toont de overlay de coördinaat van de laatst
aangetikte positie.

### Schaal en rotatie

Uit de transformatie leidt de app ook af:

- de **schaal** (hoeveel meter één tekeneenheid/pixel voorstelt) — getoond als schaalbalk
  en als getal ("1 px = 0,05 m");
- de **rotatie** van de tekening ten opzichte van RD-noorden, zodat je in één oogopslag
  ziet of je tekening gedraaid is t.o.v. de werkelijkheid.

De gekalibreerde schaal is een onafhankelijke meting los van de tekenschaal die je zelf
instelt (rechtsonder in de statusbalk, of via het menu). Klik **"Gebruik als tekenschaal"**
in het georeferentie-paneel om de tekenschaal expliciet over te nemen van de kalibratie —
dit gebeurt nooit automatisch/stil, en de app vraagt om bevestiging omdat dit invloed heeft
op hoe bestaande maten in de tekening worden weergegeven.

### Opslag

Referentiepunten (en de drempel-/WGS84-instelling) worden opgeslagen als onderdeel van het
projectbestand (**Opslaan** / **Openen**, `.plan.json`). De transformatie zelf wordt niet
apart bewaard maar bij het openen opnieuw berekend uit de opgeslagen punten — dat is
sneller te controleren en kan nooit uit de pas lopen met de punten. Doordat de
referentiepunten in dezelfde wereld-/documentcoördinaten staan als de rest van de
tekening, blijft de kalibratie kloppen ongeacht pan- of zoomstand.

## Codestructuur

- `index.html` — de volledige applicatie (canvas-tekenlaag, UI, state, alle tools).
- `geometry.js` — pure, DOM-vrije geometrie-wiskunde (snijpunten, hoeken, trim-tool).
- `georeference.js` — pure, DOM-vrije georeferentie-wiskunde (affiene fit, transformatie,
  inverse transformatie, residuen, schaal/rotatie-afleiding, kwaliteitscontrole).
- `geometry.test.js`, `georeference.test.js` — Node-only unit tests (`assert`, geen
  framework), draai met `node <bestand>.test.js`.
