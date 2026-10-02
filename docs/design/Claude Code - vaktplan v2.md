# Claude Code – Vaktplan v2

Fasit for utseende, tekster og oppførsel er de to prototypene:

- `Vaktplan v2.dc.html` – ansattvisningen
- `Vaktplan v2 Leder.dc.html` – ledervisningen

Begge har en kontrollrad øverst (Rolle, Format, Funksjoner/Pakke, Ukestatus, Tilstand). Den finnes bare i prototypen og skal ikke bygges. Tekster i prototypene er ordrette og skal brukes uendret. Kall det alltid «nettsiden» eller «systemet», aldri «app».

---

## 1. Grunnlag

**Farger**

| Token | Verdi |
|---|---|
| ink (tekst, primærknapp) | `#0B2545` |
| ink-hover | `#16345E` |
| bg | `#F4F1EA` |
| card | `#FFFFFF` |
| soft | `#FBFAF6` |
| line / line-soft | `#E4DFD4` / `#EFEBE2` |
| muted / muted-2 | `#586174` / `#8A909C` |
| yellow / yellow-soft / on-yellow | `#F6DF6E` / `#FFF4CC` / `#7A5A00` |
| green / green-soft | `#1F7D52` / `#E2F1E8` |
| red / red-soft | `#A2371C` / `#FBEDEA` |
| overtid | bg `#FFF4CC`, kant `#EAD88A` |
| kollega | `#C9CDD5` |
| vil bytte | `#C9D6EA` (kortbakgrunn `#EEF2F9`) |
| ledig (kortbakgrunn) | `#FFF9E0` |

**Statusfarger for vakter** brukes likt overalt: stripe til venstre på kort (`box-shadow: inset 4px 0 0 <farge>`), brikker i kalender og fargekoder i filter.

| Status | Stripe | Bakgrunn | Merke |
|---|---|---|---|
| Min vakt / vanlig vakt | `#0B2545` | hvit | – |
| Kollegas vakt | `#C9CDD5` | hvit, dempet | – |
| Ledig | `#F6DF6E` | `#FFF9E0` | «N interessert(e)» / «Ingen interesse ennå» |
| Vil bytte bort | `#C9D6EA` | `#EEF2F9` | «Vil bytte bort» |
| Fri søkt | `#A2371C` | `#FBEDEA` | «Fri søkt» |
| Overtid | `#0B2545` | `#FFF4CC` + kant `#EAD88A` | «Overtid» |
| Ikke publisert | – | – | kant `1.5px dashed #586174`, merke «Ikke publisert» |
| Kan jobbe | – | `#E2F1E8` / tekst `#1F7D52` | ikon `check_circle` |
| Kan ikke | – | `#FBEDEA` / tekst `#A2371C` | ikon `block` |

Farge står aldri alene: alle statuser har ikon og tekst, og alle vaktkort har `aria-label` med navn, dag, tid, type, sted og status.

**Skrift:** Schibsted Grotesk 400/500/600/700. IBM Plex Mono for klokkeslett, timer og beløp (`13:00–21:00`, `22,5 t`). Små versaler (12 px, 0.08em, 600, muted) bare på seksjonsoverskrifter.

**Form:** kort 14–18 px radius, knapper 10–12 px, piller 99 px, ikonknapper runde 44 px. Skygge `0 1px 3px rgba(11,37,69,.06)`. Ikoner: Material Symbols Rounded.

**Bevegelse:** ark glir opp (`sheetUp .25s`), sidepanel glir inn fra høyre (`slideIn .25s`), modal og melding toner inn (`fadeIn .2s`). Skjelett pulserer 1,4 s.

**Melding (toast):** mørk, nederst sentrert, maks 460 px, forsvinner etter 5 s. «Angre» vises når handlingen kan reverseres. Angre setter tilbake hele tilstanden fra før handlingen.

**Regneregler**
- Pause 30 min på vakter over 5,5 t. Arbeidstid = varighet − pause.
- Overtid: timer over ukegrensen (standard 40 t) eller over dagsgrensen (standard 9 t). Vakten som gjør at uka går over grensen, får merket «Overtid».
- Merarbeid: deltidsansatte (avtale under 37,5 t) som går over avtalen, men ikke over 40 t.
- Hviletid: advarsel hvis det er under 11 t mellom slutt på én vakt og start på neste.
- Tall vises med komma og uten unødvendige desimaler: `45 t`, `22,5 t`.

---

## 2. Brytepunkter og layout

| Format | Bredde | Ansatt: navigasjon | Leder: navigasjon | Leder: Uke |
|---|---|---|---|---|
| Mobil stående | < 640 | Bunnmeny (5) | Bunnmeny: Uke · Svar · Ansatte · Innstillinger · Assistent | Kort per ansatt med 7 små ruter, dag- og månedsvisning |
| Mobil liggende | 640–930, lav høyde | Smal sidestripe (100 px) | Smal sidestripe (100 px) + kompakt topp (52 px) | Rutenett, min. 920 px, ruller vannrett **inne i kortet** |
| Nettbrett stående | 744–834 | Ikon-meny (88 px) | Topp: rad 1 merke/handlinger, rad 2 faner (56 + 56 px) | Rutenett med 7 smale kolonner, korte tider (`13–21`) |
| Nettbrett liggende | 1024–1194 | Venstremeny med tekst (236 px) | Topp med to rader | Fullt rutenett, sidepanel til høyre |
| PC | ≥ 1280 | Venstremeny (248 px) | Én toppmeny (64 px) med faner | Fullt rutenett, maks innholdsbredde 1280 |

Regler:
- Hele siden ruller aldri vannrett. Bare rutenettet på mobil liggende ruller vannrett, inne i sitt eget kort.
- Ingen store tomrom: Oversikt (ansatt) bruker to spalter når innholdet er ≥ 700 px bredt. Ansatte-kort bruker 2 kolonner på nettbrett stående og mobil liggende, og 1 kolonne på mobil stående.
- Trykkflater minst 44 × 44 px på mobil og nettbrett.
- Faner står på én linje og ruller vannrett hvis de ikke får plass.
- Modal (Lag/endre vakt, 620 px) brukes på nettbrett liggende og PC. Ellers brukes ark nedenfra (90 % høyde, håndtak). På mobil liggende fyller arket hele høyden.
- Sidepanel (Ansatt, Assistent, 420 px) på nettbrett liggende og PC. Ellers ark nedenfra eller egen skjerm (Assistent).

---

## 3. Ansattvisningen

Se `Vaktplan v2.dc.html` for alle tekster. Skjermene er Oversikt, Tilpass oversikten, Vakter (liste, kalender og uke), Filter (ark), Vaktdetalj, Ledige, Bytter, Tilgjengelighet (enkel og detaljert), Fravær, Timer, Mer, Kolleger og Min side.

Det viktigste:
- **Bunnmeny (mobil):** Oversikt · Vakter · Ledige · Timer · Mer. Gult teller-merke der noe venter. «Ledige» vises bare når Ledige vakter er på, og «Timer» bare når Timeregistrering er på.
- **Mer:** Tilgjengelighet, Fravær, Bytter, Kolleger og Min side. Hvert valg vises bare hvis funksjonen er på.
- **Vakter, liste:** datoen er festet til venstre ved rulling, kortene har statusstripe, og kollegers vakter er dempet.
- **Tilgjengelighet rett i vaktlisten** (ny): under hver dag ligger en rad.
  - Dag uten vakt: «Kan du jobbe?» med knappene **Kan** og **Kan ikke**.
  - Dag med vakt: «Får du ikke jobbet?» med bare **Kan ikke**.
  - Trykker man på valgt knapp igjen, nullstilles dagen.
  - «Kan ikke» på en dag med vakt lager en forespørsel om fri, og vaktkortet får «Fri søkt».
  - Meldinger: «Du har bedt om fri {dag}. Lederen får beskjed.» / «Lagret: du kan jobbe {dag}.» / «Lagret: du kan ikke jobbe {dag}.» / «Forespørselen om fri {dag} er trukket.» / «Tilgjengeligheten for {dag} er fjernet.», alle med Angre.
  - Raden vises ikke hvis Tilgjengelighet er av, eller hvis brukeren har filtrert bort fravær eller tilgjengelighet.
- **Vaktdetalj:** hel skjerm på mobil og nettbrett stående, sidepanel (400 px) på nettbrett liggende og PC.
- **Uke:** standard på alle formater unntatt mobil stående, med bryteren Liste / Uke.

---

## 4. Ledervisningen

### 4.1 Toppmeny
`[Rettført] | Vaktplan` · foretak («Nordhavn Kafé AS») · faner **Uke · Forespørsler · Ansatte · Innstillinger** · «Til regnskapet ↗» (åpner min.rettført.no i ny fane, bare ikon på nettbrett stående) · **Assistent** (bare i Selskap) · profil (KL).
Forespørsler har et gult teller-merke: antall forespørsler + antall timelister som venter.

### 4.2 Uke (hovedskjerm)
**Topp:**
- ‹ «Uke 41» / «5.–11. okt 2026» ›
- statusmerke: «Utkast» (`edit_note`, grå), «Endringer ikke publisert» (`pending`, gul) eller «Publisert» (`check_circle`, grønn)
- knappen «Publiser og varsle». Når uka er publisert, er knappen grå og deaktivert og heter «Publisert».

**Under toppen:** Visning **Dag · Uke · Måned**, og sted **Alle steder · Sentrum · Brygga** (vises når foretaket har mer enn ett sted).

**Banner (stiplet kant):**
- Utkast: «Uka er et utkast. De ansatte ser den ikke før du publiserer. Vakter med stiplet kant er ikke publisert.»
- Endringer: «{n} endring(er) er ikke publisert (stiplet kant). De ansatte ser fortsatt forrige versjon.»

**Trenger svar** (kort øverst, med teller og «Se alle» som går til Forespørsler). Hver rad har ikon, tittel, undertekst og knapper:

| Type | Tittel | Knapper | Resultat |
|---|---|---|---|
| Fri | «Jonas Berg ber om fri» | **Godkjenn** / Avslå | Godkjenn: vakten blir ledig. Melding: «Fri godkjent. Fredagsvakten er nå ledig, og Jonas har fått beskjed.» |
| Bytte | «Mari Holm vil bytte bort» | **Gjør vakten ledig** / Avslå | «Torsdagsvakten er nå ledig. Mari har fått beskjed.» |
| Ledig med interesse | «Ledig lørdag 10. okt · 10:00–18:00» | **Gi til Jonas** / Gi til Emma | Undertekst sier hvem som får merarbeid. Melding: «Vakten {dag} er gitt til {navn}. Hun/Han får e-post når du publiserer.» |
| Fravær | «Ali Hassan søker avspasering» | **Godkjenn** / Avslå | «Avspaseringen er godkjent. Ali har fått beskjed.» |
| Timer | «Timer for uke 40 venter» | **Godkjenn de som stemmer** / Se timer | Godkjenner timelister uten avvik |

Ingen rader: «Alt er besvart.» med grønn hake. Alle svar har Angre.

**Rutenett (Uke):**
- Kolonner: ansatt (150–220 px) + 7 dager. Dagens dato er markert med en mørk sirkel.
- Rad 1 er «Ledige vakter» med gul bakgrunn. Deretter kommer én rad per ansatt.
- Radhodet viser avatar, navn, timer mot avtale (`45 / 37,5 t`) og en strek. Streken er gul ved overtid eller merarbeid, med tekst som «5 t overtid» eller «7,5 t merarbeid». Timelønnede viser bare timer.
- Ruten viser vaktkort (tid i mono, type · sted, statusmerke) og tilgjengelighet («Kan jobbe» / «Kan ikke: Tannlege»).

| Handling | Resultat |
|---|---|
| Trykk på tom rute eller «+» | Lag vakt, med ansatt og dag ferdig utfylt |
| Hover på PC | «+» vises i ruten. På nettbrett er «+» alltid synlig i tomme ruter. |
| Trykk på vakt | Endre vakt |
| Dra vakt (nettbrett og PC) | Vakten flyttes til en annen dag eller ansatt, eller til Ledige. Melding: «Vakten er flyttet til {navn}, {dag}.» med Angre. Bytter man ansatt, nullstilles fri, bytte og interesse. |
| Trykk på navn | Ansatt-panel |
| Trykk på dato | Dagvisning for den dagen |

**Mobil stående (Uke):** dagrad øverst. Under kommer ett kort per ansatt (og ett for Ledige) med 7 ruter: tid `13–21` og statusikon, «Kan» / «Kan ikke», eller «+».

**Dag:**
- 7 dagknapper med antall vakter
- overskrift «Mandag 5. okt» og «{t} t planlagt»
- tilgjengelighetslinjer («Emma Lie kan jobbe» / «Jonas Berg kan ikke: Tannlege»)
- vaktkort, ledige først og så etter starttid (to kolonner på nettbrett liggende og PC)
- «Ingen vakter denne dagen.» når dagen er tom
- knappen «+ Ny vakt {dag}»

**Måned:** rutenett man–søn. Hver dag viser antall vakter og ledige. Trykk på en dag åpner dagvisning.

**Tilstander:**
- Laster: skjelett.
- Feil: «Fikk ikke kontakt. Prøv igjen.» med knappen «Prøv igjen».
- Tom: maskot, «Ingen vakter i uke 41 ennå.», knappen «Lag første vakt» og «Be assistenten om et forslag» (bare i Selskap).

### 4.3 Lag og endre vakt
Modal på nettbrett liggende og PC, ark ellers. Tittel «Ny vakt» / «Endre vakt», undertekst «{dag} · {sted}».

**Felter:**
- **Ansatt:** pille-knapper Ledig, Sara, Ali, Jonas, Emma og Mari. De som har meldt interesse, merkes «interessert».
- **Dato:** 7 knapper.
- **Mal:** Åpning 07:00–15:00, Midt 10:00–18:00, Kveld 13:00–21:00 og Natt/rydd 21:00–23:30. Malen fyller ut type, start og slutt.
- **Start og Slutt:** klokkeslett i mono, med tekst ved siden av: «Pause 30 min · 7,5 t arbeid» / «Ingen pause · 5 t».
- **Sted:** Sentrum / Brygga.
- **Gjenta:** Aldri / Hver uke / Annenhver uke.
- **Kommentar:** vises bare når Kommentarer er på.

**Advarsler** i gul boks, regnet ut mens man fyller ut:
- «Gir {navn} {x} t overtid ({t} t denne uka)»
- «Gir {navn} merarbeid: {t} t, avtalen er {a} t»
- «Over {grense} t på én dag»
- «{navn} har allerede en vakt {dag}»
- «{navn} har sagt at han/hun ikke kan («{grunn}»)»
- «Under 11 t hvile ({t} t etter vakten {dag})» eller «… før vakten {dag}» (bare når Hviletid er på)

**Knapper:** Slett (bare når man endrer), Avbryt og Lagre. Lagre heter «Lagre likevel» når det finnes advarsler.

**Etter lagring:**
- Vakten markeres som ikke publisert. En publisert uke får status «Endringer ikke publisert».
- Melding: «Vakten er lagt til. Publiser for å varsle.», «Vakten er endret. Publiser for å varsle.» eller «… i utkastet.»

### 4.4 Ansatt-panel
Sidepanel eller ark med:
- avatar, navn, stilling og avtale
- «Uke 41» med timer og strek
- vaktene (trykk for å endre)
- tilgjengelighet
- kontakt (telefon som `tel:`, e-post som `mailto:`)
- knappen «Lag vakt for {navn}»

### 4.5 Forespørsler og timer
Faner: **Forespørsler** og **Timer**, begge med teller.

**Forespørsler:**
- Filter: Alle · Fri · Bytter · Ledige · Fravær, med antall.
- «Godkjenn alle som er i orden» godkjenner fravær uten konflikt og timelister uten avvik. Melding: «Godkjent: {…}. Resten trenger at du ser på dem.»
- Hvert kort har type i små versaler, tittel, undertekst og knapper.
- Tom: maskot, «Alt er besvart.» og «Du får beskjed på e-post når noen spør om noe.»

**Timer:**
- Grønn linje øverst: «Godkjente timer går rett til Lønn i regnskapet.»
- Uke-kort «Uke 40, 28. sep–4. okt» med sum og «Godkjenn de som stemmer».
- Rader per ansatt: «Godkjent av leder» (grå hake) eller «Venter på godkjenning» (tom sirkel), timer i mono og knappen Godkjenn.
- Avvik vises som gul pille, for eksempel «Fredag 2. okt: 30 min lenger enn planlagt».

### 4.6 Ansatte
- Overskrift og telling:
  - Selskap: «6 ansatte. Alle er med i Selskap, som har plass til 15.»
  - Start: «6 ansatte. 5 er med i Start, 1 er ekstra (29 kr/mnd)»
- **PC og nettbrett liggende:** tabell med Navn (+ «Leder»), Stilling, Avtale, Tilgang, Timer okt. og handlingene Endre og Inviter / Send på nytt.
- **Mindre skjermer:** kort.
- Tilgang: «Logget inn» (grønn), «Invitert» (gul) eller «Ikke invitert» (grå).
- Inviter: «Invitasjonen er sendt til {e-post}. Hun/Han logger inn med lenken i e-posten.»

### 4.7 Innstillinger for vaktplanen
- Ingress: «Du bestemmer hva de ansatte kan gjøre. Det du slår av, forsvinner helt for dem.»
- Merke «Standard» (grønn) eller «Endret fra standard» (gul).
- Knappene «Tilbakestill til standard» og «Lagre». Lagre er grå til noe er endret.
- Lagret: «Innstillingene er lagret. De ansatte ser endringene med en gang.»

Hver rad har navn, én setning, en bryter (`role="switch"`) og under-valg som vises når bryteren er på.

| Nøkkel | Funksjon | Under-valg | Standard |
|---|---|---|---|
| colleagues | Ansatte ser kollegers vakter | Vis: Navn / Bare «opptatt» | på, Navn |
| open | Ledige vakter | Hvem får vakten: Lederen velger / Først til mølla. Vis advarsel om overtid. | på, Lederen velger, advarsel på |
| swap | Bytte vakter | Lederen må godkjenne byttet. Bare med kolleger som har samme vakttype. | på, godkjenning på |
| give | Gi bort vakt | Frist: minst X timer før vakten (steg 12) | på, 24 |
| avail | Tilgjengelighet | Enkel (dager) / Detaljert (tidsrom). Frist: senest X dager før uka publiseres. | på, Enkel, 7 |
| absence | Fravær | Per type: kan søkes (avkrysning) og Med / Uten lønn som standard (se 4.9). Vis saldo. | på, alle 8 typer, saldo på |
| hours | Timeregistrering og godkjenning | Ansatte kan melde avvik. Godkjenn automatisk når timene stemmer med vakten. | på, avvik på, auto av |
| ot | Overtid og merarbeid | Tillegg 40 / 50 / 100 %. Grense per dag (t) og per uke (t). | på, 40 %, 9 t, 40 t |
| rest | Hviletid | – | på |
| comments | Kommentarer på vakter | – | på |
| notif | Varsler | Ny uke er publisert. Endringer i vaktene deres. Svar på forespørsler. | på, alle |
| assistant | Assistent i vaktplanen | Bare i Selskap. I Start: merket «Bare i Selskap», uten bryter. | på |

**Hva hver innstilling skjuler for de ansatte:**
- open av → «Ledige» i bunnmenyen og ledige vakter i lister og på Oversikt.
- hours av → «Timer» i bunnmenyen og timer i Trenger svar for lederen.
- avail av → Tilgjengelighet i Mer, raden Kan / Kan ikke i vaktlisten og «Kan jobbe»-merker hos lederen.
- absence av → Fravær i Mer. Er både avail og absence av, forsvinner også «Be om fri denne dagen».
- swap og give av → Bytter i Mer og knappen «Gi bort / bytt vakt». Navnet på knappen følger hva som er på: «Gi bort / bytt vakt», «Bytt vakt» eller «Gi bort vakt».
- colleagues av → kollegers vakter og Kolleger i Mer. Med «Bare opptatt» står det «Opptatt» i stedet for navn.
- comments av → «Legg til kommentar» og kommentarfeltet i Lag vakt.
- ot av → overtids- og merarbeidsadvarsler og merket «Overtid».
- rest av → advarselen om hviletid.

**Forhåndsvisning** «Slik ser det ut for de ansatte»:
- vises til høyre (320 px, festet) på nettbrett liggende og PC, og under listen på mindre skjermer
- oppdateres mens man slår av og på, før lagring
- viser minivakt, kollegalinje, knapper, ledig-kort med advarsel og regel, bunnmeny og «Under «Mer»: …»

### 4.8 Assistent (bare i Selskap)
- Sidepanel på nettbrett liggende og PC. Egen skjerm og menyvalg på mobil og nettbrett stående.
- Innledning: «Hei, Kari. Jeg lager forslag til vaktplanen. Du godkjenner, og jeg publiserer aldri noe selv.»
- Forslag-knapper: «Lag vaktplan for neste uke», «Hvem bør ta lørdag?» og «Får noen overtid denne uka?»
- Svaret er et **forslag-kort** (gul topplinje, «FORSLAG») med tittel, begrunnelse, punkter og knappene **{handling}** / Forkast. Etter et valg får kortet merket «Godkjent», «Lagret som utkast» eller «Forkastet».
- Det assistenten gjør, havner som upublisert endring eller utkast. Den publiserer aldri.

### 4.9 Godkjenne fravær og fri
«Godkjenn» eller «Avslå» på fri eller fravær (i Trenger svar eller under Forespørsler) åpner et vindu: modal på nettbrett liggende og PC, ark nedenfra ellers. Lederen kan også registrere fravær selv fra Ansatt-panelet med «Registrer fravær», for eksempel en egenmelding.

**Felter:**
- «Søkte om: Fri · «Tannlege»» (bare når den ansatte har søkt). Ved «Registrer fravær» vises en datovelger i stedet.
- **Registrer som:** Fri uten lønn · Ferie · Avspasering · Egenmelding · Sykmelding · Permisjon med lønn · Permisjon uten lønn · Velferdspermisjon. Bare typene som er slått på i Innstillinger → Fravær vises.
- **Lønn:** Med lønn / Uten lønn. Valget følger standarden for typen, men lederen kan endre det.
  - Endret fra standard: «Standard for {type} er med/uten lønn. Du har endret det for dette fraværet.»
  - Teksten under viser hva som skjer, for eksempel «Med lønn: 7,5 t går til Lønn som fravær med lønn.», «Uten lønn: 7,5 t trekkes, og ingenting betales.», «Ferie: … dekkes av feriepenger.» eller «Ingen planlagte timer denne dagen, så ingenting går til Lønn.»
- **Saldo** (når Vis saldo er på):
  - Ferie: «18 dager igjen → 17»
  - Avspasering: «12 t → 6 t»
  - Egenmelding: «1 → 2 av 24 dager brukt»
  - Går saldoen under null, blir boksen rød med teksten «Saldoen går under null.»
- **Vakten den dagen** (bare når det finnes en vakt): Gjør ledig (standard) · Gi til … · Slett vakten.
  - «Gi til …» viser kolleger som er ledige den dagen, sortert med «kan jobbe» først, og merker «overtid», «merarbeid» og «kan ikke».
  - Godkjenn er deaktivert til en kollega er valgt.
- **Kommentar til {navn}** (valgfritt). Ved avslag heter feltet «Grunn (sendes til {navn})».

**Knapper:** «Avslå i stedet» / «Godkjenn i stedet» · Avbryt · Godkjenn / Registrer / Avslå (rød).

**Etter godkjenning:**
- Fraværet lagres med type, lønn og timer, og saldoen oppdateres.
- Vakten håndteres som valgt og blir en upublisert endring.
- Melding: «{type} er registrert for {navn}, med/uten lønn. Vakten er nå ledig. {navn} har fått beskjed.», med Angre.

**Hvor fraværet vises:**
- I uke-rutenettet som en rød brikke med typen (ikon `event_busy`). Brikken erstatter «Kan ikke».
- I dagvisningen: «{navn}: {type}, med/uten lønn».
- Under Timer i kortet «Fravær til Lønn», med Med lønn / Uten lønn / Feriepenger og timer.
- I Ansatt-panelet under «Fravær og saldo», sammen med tidligere godkjent fravær.

**Innstillinger → Fravær:** én rad per type, med avkrysning (kan søkes) og Med lønn / Uten lønn som standard.

| Type | Standard |
|---|---|
| Fri uten lønn | uten lønn |
| Ferie | med lønn |
| Avspasering | med lønn |
| Egenmelding | med lønn |
| Sykmelding | med lønn |
| Permisjon med lønn | med lønn |
| Permisjon uten lønn | uten lønn |
| Velferdspermisjon | med lønn |

### 4.10 Invitere, administrere og fjerne ansatte
**Inviter ansatt** (knapp øverst på Ansatte):
- Felter: Navn, E-post, Mobil (valgfritt, for SMS senere), Stilling (Kafémedarbeider / Barista / Kokk / Skiftleder) og Avtale (Fast stilling med stillingsprosent i steg på 10 % og t/uke vist ved siden av, eller Timelønn).
- Pakke-linje:
  - «Dette blir ansatt nr. 7. Det er inkludert i Selskap (15 ansatte).»
  - I Start, gul: «… Start har 5 inkludert, så det koster 29 kr/mnd ekstra.»
- Forhåndsvisning av e-posten: «Hei, {fornavn}. Kari Lund har invitert deg til vaktplanen for Nordhavn Kafé AS.», knappen «Logg inn på vaktplanen» og «Lenken gjelder i 7 dager. Du trenger ikke passord.»
- Feil: «Skriv inn navnet til den ansatte.», «Skriv inn en gyldig e-postadresse.» og «Denne e-postadressen er allerede i bruk.»
- Send: den ansatte legges til med tilgang «Invitert» og vises i rutenettet. Melding: «Invitasjonen er sendt til {e-post}. {fornavn} logger inn med lenken i e-posten.»

**Administrer ansatt** (Endre i tabellen eller på kortet, eller «Administrer ansatt» i Ansatt-panelet):
- Felter: Stilling, Avtale, E-post og Mobil, så Lagre.
- **Tilgang til vaktplanen:** status, tekst og knapp.
  - Logget inn: «Tilbakestill innlogging». Ansatte har ikke passord, så dette er «tilbakestill passord». Det sender en ny lenke, gjør de gamle ugyldige og logger den ansatte ut på alle enheter. Melding: «Ny innloggingslenke er sendt til {e-post}. De gamle lenkene virker ikke lenger, og {navn} er logget ut på alle enheter.»
  - Invitert: «Send invitasjonen på nytt».
  - Ikke invitert: «Send invitasjon».
- **Fjern fra vaktplanen** (ikke for lederen) åpner en bekreftelse: «Fjerne {navn}?» med disse punktene:
  - mister tilgangen med en gang, og lenken slutter å virke
  - «{n} vakter i uke 41 blir ledige»
  - timer, fravær og lønn blir liggende i regnskapet
  - kan inviteres igjen senere

  Knappene er «Avbryt» og «Fjern {navn}» (rød). Når den ansatte fjernes, blir vaktene ledige og upubliserte, og interessen hens på ledige vakter fjernes. Melding med Angre.
- Telling på Ansatte: «{n} ansatte. Alle er med i {pakke}, som har plass til {5/15}.» Når det er flere enn pakken har plass til: «{n} ansatte. 5 er med i Start, {x} er ekstra ({x·29} kr/mnd)».

---

## 5. Data (eksempel, uke 41, 5.–11. okt 2026)

- Sara: man–lør, 6 × 7,5 = 45 t. Lørdag får merket «Overtid».
- Ali: man, tir, tor og fre Midt = 30 t.
- Jonas: man, ons og fre Kveld = 22,5 t. Fredag har «Fri søkt» (Tannlege). Han kan jobbe lørdag og søndag.
- Emma: tir og tor Kveld = 15 t. Torsdag er ikke publisert. Hun kan jobbe lørdag og søndag.
- Mari: man Åpning, ons Midt og tor Åpning (vil bytte bort) = 22,5 t.
- Ledige: lør 10–18 Sentrum (Jonas og Emma har meldt interesse) og søn 13–21 Brygga.
- Timer uke 40: Jonas 27 t godkjent og 3,5 t venter med avvik. Sara 37,5 t og Ali 30 t venter. Emma 14,5 t venter med avvik. Mari 22,5 t er godkjent.

## 6. Må fortsette å virke
Innlogging med lenke for ansatte, publisering av uke med varsel, ledige vakter med interesse, bytte bort, «kan ikke» → forespørsel om fri, overtid og merarbeid (9 t/dag, 40 t/uke, merarbeid for deltid), pause 30 min over 5,5 t, timer til lønn, 5 ansatte i Start og 15 i Selskap (29 kr/mnd per ekstra), og assistent bare i Selskap.
