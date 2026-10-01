# Rettført Vaktplan v2: designbrief

**Til:** Claude Design
**Fra:** Rettført
**Gjelder:** Ny utforming av vaktplanen på vaktplan.rettført.no, for både ansatte og ledere, på mobil, nettbrett og PC.

Du skal bare designe. Vi har allerede bygget systemet (Next.js). Det du leverer, blir fasit for utseende, tekster og oppførsel, og Claude Code bygger det etterpå.

---

## 1. Hva vi vil oppnå

Vi har sett på et etablert vaktsystem som de ansatte opplever som veldig oversiktlig og lett å bruke på mobil. Vi vil ha samme **logikk og ro**:

- én oppgave per skjerm
- store, tydelige kort
- datoen alltid synlig til venstre
- farge betyr status
- alt man ser, kan man trykke på for å få mer info

Det skal likevel se ut som **Rettført**, ikke som det andre systemet. Seksjon 3 er bindende for logo, farger og skrift.

Tre målgrupper:

1. **Ansatt på mobil.** Dette er hovedbruken: se vaktene sine, ta ledige vakter, bytte, si når man kan jobbe, be om fri og se timene sine.
2. **Leder.** Holder oversikten, lager uka, svarer på forespørsler, godkjenner timer og **bestemmer hvilke funksjoner som er på**. Bruker både PC og mobil.
3. **Alle skjermstørrelser.** Mobil, nettbrett og PC, stående og liggende. Ingenting skal klemmes, og det skal aldri bli store tomrom (se seksjon 7).

Kall det alltid «nettsiden» eller «systemet», aldri «app», i alle tekster.

---

## 2. Referansen: dette likte vi (beskrevet, ikke kopiert)

Skjermbildene vi så på, viste et mobilsystem for ansatte med disse mønstrene. Ta med **mønstrene**, ikke utseendet:

| Skjerm i referansen | Mønster vi vil ha |
|---|---|
| Oversikt (startside) | Seksjoner med overskrift i små versaler: «Vakttilbud» (teller-merke og «Se alle»), «Kommende vakter». Dag og dato i en egen kolonne til venstre (`tor.` over stor `1`), kortet til høyre med tid i fet skrift, vakttype og sted. |
| Tilpass oversikten | Den ansatte velger selv hvilke blokker som vises på startsiden, i hvilken rekkefølge (dra-håndtak), skjul/vis (øye-ikon) og antall (− 3 +). Avbryt og Lagre øverst. |
| Sidemeny | Logo øverst. Grupper med små overskrifter («Arbeid», «Kommunikasjon»). Ikon + tekst per valg, aktiv side markert med myk bakgrunn, teller-merke på valg med noe nytt. Innstillinger nederst. |
| Vaktplan (liste) | Måned øverst med kalender-, filter- og «…»-knapp. Datoen er festet til venstre mens man ruller. Kort med **farget stripe til venstre** som viser status (gul = ledig). Kortet viser avatar, tid, vakttype, navn og sted, med ikon for kommentar og status, og kan foldes ut. Kollegers vakter vises også, med navn. |
| Filter | Liste over vakttyper med fargekode og ikon, hver med avkrysning: mine vakter, fravær, byttbar, ledig, tilgjengelighet, kollegers vakter, slutt på publisert periode. Under: sted, avdeling, vakttype og ansatt (antall valgt + pil). Nederst: «Lagre som mitt filter» og «Tilbakestill». |
| «…»-meny | Oppsummering av perioden (timer, antall vakter), Oppdater. |
| Månedskalender | Ruter per dag med små fargede brikker: egen vakt (mørk, med tid), ledige (gul, med antall), tilgjengelighet (grønn), fravær (rød). I dag er markert sterkt og valgt dag mykt. Piler for måned. Trykk på en dag for å se den. |
| Attester / timer | Periode øverst med sum timer. Gruppert per uke («Uke 39, 21.–27. sep (27,00)»), så per dag med timer til høyre. Hver vakt viser status: «Godkjent av leder» (grå hake) eller «Venter på godkjenning» (tom sirkel). |
| Bytteforespørsler | Faner: Mottatt og Sendt. Vennlig tom-tilstand med illustrasjon og kort tekst. |
| Tilgjengelighet | Ukevisning med timerad (00–24) og en kolonne per dag. Dagens dato markert, uke med piler, + for å legge til, sum for uka nederst. |
| Legg til tilgjengelighet | Skjema i kort: dato, hele dagen (bryter), start og slutt, gjenta (aldri / hver uke / …), kommentar. Avbryt og Lagre i toppen. |
| Fravær | Faner: Søknader og Saldo (feriedager igjen osv.). Rader med statusikon (godkjent / venter / avslått), type (ferie, egenmelding, avspasering, permisjon) og periode. |
| Vaktdetalj («Min vakt») | Toppfelt i vaktens statusfarge, med avatar og navn. Info i rader med ikon: sted, vakttype, tid og pause, avtale (f.eks. 37,5 t/uke). Under «Hva vil du gjøre?» ligger store knapper i full bredde: «Gi bort / bytt vakt», «Be om fri», «Legg til kommentar». |

Felles for alt: lys grå-beige bakgrunn, hvite kort med myk skygge og store avrundinger, runde ikonknapper i toppen, en flytende knapp nede til høyre der det passer, og store trykkflater.

---

## 3. Rettførts uttrykk (bindende)

Vaktplanen er en del av Rettført og skal se ut som resten av systemet (min.rettført.no) og nettsiden (rettført.no).

**Logo:** `rettfort-logo.png`, ordbildet «Rettført». Bruk den alltid sammen med ordet **«Vaktplan»**, adskilt med en tynn loddrett strek: `[Rettført] | Vaktplan`. På små skjermer holder logoen alene.

**Farger:**

| Rolle | Farge |
|---|---|
| Tekst, primærknapper, mørke flater | `#0B2545` (blå-svart) |
| Hover på mørk | `#16345E` |
| Bakgrunn | `#F4F1EA` (beige) |
| Kort | `#FFFFFF` |
| Mykere flate | `#FBFAF6` |
| Linjer | `#E4DFD4`, svakere `#EFEBE2` |
| Dempet tekst | `#586174`, svakere `#8A909C` |
| Gul (merke, valgt, ledig) | `#F6DF6E`, mykere `#FFF4CC`, mørk tekst på gul `#7A5A00` |
| Grønn (godkjent, kan jobbe) | `#1F7D52`, lys `#E2F1E8` |
| Rød (fravær, kan ikke, avslått) | `#A2371C`, lys `#FBEDEA` |
| Overtid | gul `#FFF4CC` med kant `#EAD88A` |

**Statusfarger for vakter** (stripen til venstre på kortet, brikker i kalenderen og fargekodene i filteret, overalt likt):

| Status | Farge |
|---|---|
| Min vakt | `#0B2545` |
| Kollegas vakt | grå `#C9CDD5` |
| Ledig vakt | gul `#F6DF6E` |
| Vil bytte bort | lys blå `#C9D6EA` |
| Kan jobbe (tilgjengelig) | grønn `#E2F1E8` / `#1F7D52` |
| Kan ikke / fravær | rød `#FBEDEA` / `#A2371C` |
| Gir overtid | `#FFF4CC` |
| Utkast (ikke publisert) | stiplet kant |

Farge skal aldri stå alene. Alle statuser har også ikon og tekst.

**Skrift:**
- Schibsted Grotesk (400/500/600/700) for alt.
- IBM Plex Mono for klokkeslett, timer og beløp, for eksempel `22:15–07:15` og `37,5 t`.
- Overskrifter i små versaler er lov, som i referansen, men bruk dem sparsomt.

**Form:**
- Kort har 14–18 px radius og knapper 10–12 px.
- Piller og merker er helt runde (99 px), og ikonknapper runde (40–44 px).
- Skygger er myke og lave, aldri harde.

**Tone:**
- Kort, vennlig, du-form, norsk bokmål. Eksempler: «Du har meldt interesse», «Lederen bestemmer hvem som får vakten», «Ingen vakter denne dagen».
- Tom-tilstander får en liten, rolig illustrasjon (gjerne Rettført-maskoten `mascot-hip.png`) og én setning.

Vi har allerede disse komponentene, og de skal brukes videre:
- **Toppmeny i systemet:** Hjem · Penger inn · Penger ut · Bank · Ansatte ▾ · Regnskap ▾ · + Ny · Assistent · profil.
- **Bunnmeny på mobil:** Hjem · Inn · Ut · Vakter · Mer.
- **Ukevisning for lederen:** rutenett med ansatte som rader og dager som kolonner, «Trenger svar», en ukevelger og dagvisning på mobil.

Vaktplan v2 skal bygge videre på dette, ikke erstatte stilen.

---

## 4. Eksempeldata (bruk disse overalt)

**Foretak:** Nordhavn Kafé AS (pakke: Selskap). To steder: **Nordhavn Sentrum** og **Nordhavn Brygga**.

| Ansatt | Stilling | Avtale | Rolle |
|---|---|---|---|
| Kari Lund | Daglig leder | Fast 100 % | Leder |
| Jonas Berg | Kafémedarbeider | Fast 60 % (22,5 t/uke) | Ansatt (dette er «meg» i ansattvisningen) |
| Sara Nilsen | Skiftleder | Fast 100 % (37,5 t/uke) | Ansatt |
| Ali Hassan | Kokk | Fast 80 % (30 t/uke) | Ansatt |
| Emma Lie | Kafémedarbeider | Timelønn | Ansatt |
| Mari Holm | Barista | Timelønn | Ansatt |

**Vakttyper:** Åpning 07:00–15:00, Midt 10:00–18:00, Kveld 13:00–21:00, Natt/rydd 21:00–23:30. Pause 30 min på vakter over 5,5 t.

**Uke 41 (5.–11. okt 2026). I dag er mandag 5. okt.**

- Jonas har vakter mandag 13–21, onsdag 13–21 og fredag 13–21, til sammen 22,5 t.
- Fredag 9. okt har Jonas «Kan ikke: Tannlege» og ber om fri. Forespørselen venter på lederen.
- Lørdag 10. okt 10–18 er ledig. Ola og Jonas har meldt interesse, og Jonas får merarbeid hvis han tar den.
- Søndag 11. okt 13–21 er ledig, ingen har meldt interesse ennå.
- Sara har 45 t denne uka, altså 5 t overtid (gul).
- Emma har sagt «Kan jobbe» lørdag og søndag.
- Mari vil bytte bort torsdag 07–15.
- Timer: Jonas har 27,0 t godkjent i uke 40 og 3,5 t som venter på godkjenning.
- Fravær: Jonas har 18 feriedager igjen, ferie 22.–26. juni er godkjent, og egenmelding 6. aug er godkjent.

---

## 5. Ansattvisningen (mobil først)

Den ansatte logger inn med en lenke på e-post (senere SMS), uten passord. Hen ser **bare vaktplanen, aldri regnskapet**. Adresse: `vaktplan.rettført.no`. Siden kan legges på hjemskjermen som «Rettført Vaktplan».

### 5.1 Navigasjon
- **Mobil:** bunnmeny med 4–5 valg: **Oversikt · Vakter · Ledige · Timer · Mer**. Under «Mer» ligger Tilgjengelighet, Fravær, Bytter, Kolleger, Min side og Innstillinger. Teller-merke (gul) der noe venter.
- **Nettbrett og PC:** samme valg som en smal venstremeny med logo øverst, grupper med små overskrifter, ikon + tekst og aktiv side markert.
- Valg som lederen har slått av (seksjon 6.5), **vises ikke i det hele tatt**. Lag skjermer som viser menyen både med alt på og med bare grunnfunksjonene.

### 5.2 Oversikt (startside)
- «Hei, Jonas.» og ukenummer.
- Et mørkt kort med **Neste vakt**: dag, dato, tid og sted, en nedtelling («om 3 timer»), og timer denne uka mot avtalen (`15 av 22,5 t`).
- **Venter på deg:** vakttilbud fra lederen, svar på bytter og fri. Maks 3, med «Se alle».
- **Kommende vakter:** datokolonne til venstre og kort til høyre (som i referansen).
- **Ledige vakter du kan ta:** maks 3 kort med gul stripe og knappen «Jeg tar den».
- **Tilpass oversikten:** blyant- eller glidebryter-ikon øverst. Egen skjerm der man drar, skjuler og velger antall (som i referansen).

### 5.3 Vakter (liste og kalender)
- **Liste:** som i referansen. Datoen er festet til venstre ved rulling, kortene har statusstripe, og det står en dagsoverskrift når dagen skifter.
- Kollegers vakter vises dempet, med navn, hvis lederen har slått det på.
- **Kalender:** trykk på kalenderikonet og få en månedsvisning med statusbrikker per dag (som i referansen). Trykk på en dag, så ruller listen dit.
- **Uke:** på nettbrett og PC er det også en ukevisning med kolonne per dag.
- **Filter:** et ark nedenfra (mobil) eller sidepanel (PC) med fargekodene fra seksjon 3, sted, vakttype og ansatt, «Lagre som mitt filter» og «Tilbakestill».
- **«…»:** Oppsummering (timer og vakter i perioden, overtid) og Oppdater.

### 5.4 Vaktdetalj
Trykk på et vaktkort, eller på navnet sitt i en vakt.

- Toppfelt i statusfargen, avatar, navn, dag og tid i stor mono-skrift.
- Rader med ikon: sted, vakttype, pause, varighet, hvem andre som jobber samtidig (avatarer), og kommentar fra lederen.
- Store knapper i full bredde, avhengig av hva lederen har slått på:
  - «Gi bort / bytt vakt»
  - «Be om fri denne dagen»
  - «Legg til kommentar»
  - på ledig vakt: «Jeg tar den» og «Trekk meg»
- Statuslinje når noe venter, for eksempel «Du har bedt om fri. Lederen har ikke svart ennå.»
- Trykk på en kollegas navn for et lite kort med navn, stilling og vakter samme dag. Kontaktinfo vises bare hvis lederen tillater det.

### 5.5 Ledige vakter
- Liste med gul stripe. Merknader: «Gir deg overtid», «Mer enn stillingen din (30 t totalt)», «Du har meldt interesse».
- Forklaring nederst: «Når du melder interesse, bestemmer lederen hvem som får vakten. Du får beskjed på e-post.»

### 5.6 Bytter
- Faner: Mottatt og Sendt.
- Et bytte kan være «gi bort» (vakten blir ledig) eller «bytt med kollega» (velg kollega og eventuelt en av hens vakter).
- Statuser: venter på kollega, venter på leder, godkjent, avslått.

### 5.7 Tilgjengelighet
- To måter, med en bryter øverst:
  - **Enkel:** liste over dager med segmentert valg Kan / Ikke satt / Kan ikke. Grunn-felt kommer når man velger «Kan ikke».
  - **Detaljert:** ukevisning med timerad, der man drar eller trykker for å markere tidsrom (som i referansen).
- Skjemaet for «Legg til tilgjengelighet» følger referansen: dato, hele dagen, start og slutt, gjenta, kommentar.
- Sum for uka nederst.
- Velger man «Kan ikke» en dag man har vakt, blir det automatisk en forespørsel om fri. Vis det tydelig før lagring.

### 5.8 Fravær
- Faner: Søknader og Saldo.
- Ny søknad: type (ferie, egenmelding, avspasering, permisjon med/uten lønn, annet), fra–til, hele dager eller tidsrom, kommentar og eventuelt vedlegg.
- Status med ikon og farge.

### 5.9 Timer (godkjenning)
- Som referansen: periode med sum, så uker og dager.
- Hver vakt er godkjent (grå hake) eller venter (tom sirkel).
- Avvik vises, for eksempel «Du jobbet 30 min lenger enn planlagt.»
- Knapp for å melde inn timer som avviker fra vakten (hvis lederen har slått det på).

### 5.10 Min side og Innstillinger
- Navn, kontakt, stilling, avtale (fast eller timer per uke).
- Varsler (e-post nå, SMS senere).
- Språk: bokmål nå, engelsk senere.
- Logg ut.

---

## 6. Ledervisningen (PC først, men full mobil)

Lederen bruker vaktplan.rettført.no med en egen, enkel toppmeny: `[Rettført] | Vaktplan`, foretak, «Til regnskapet ↗», Assistent (i Selskap) og profil. Lederen kan også se alt den ansatte ser.

### 6.1 Uke (hovedskjermen)
- Bygg videre på det vi har: et rutenett med ansatte som rader og dager som kolonner, en egen rad for «Ledige vakter» øverst, og timer mot avtale per ansatt med strek (gul ved overtid).
- Ukevelger, statusmerke (Utkast / Publisert / Endringer ikke publisert) og «Publiser og varsle».
- **Trenger svar** øverst: fri, bytter, ledige med interesse, og timer som venter. Hver rad har sine knapper, for eksempel «Godkjenn», «Avslå» og «Gi til Jonas».
- **Interaksjon:**
  - Trykk i en tom rute for å lage en vakt.
  - Trykk på en vakt for å endre den.
  - Dra en vakt til en annen dag eller ansatt (PC og nettbrett).
  - Trykk på navnet til en ansatt for et sidepanel med uka, timer, tilgjengelighet og kontaktinfo.
  - Trykk på en dato for dagvisning.
- **Visninger:** Dag · Uke · Måned, og «Per sted» når foretaket har flere steder.

### 6.2 Lag og endre vakt
- Modal på PC og ark nedenfra på mobil.
- Felter: ansatt eller «Ledig», dato, maler (Åpning, Midt, Kveld …), start og slutt, pause, sted, vakttype, kommentar, gjenta.
- Advarsler før lagring: «Gir Sara 5 t overtid», «Jonas har sagt at han ikke kan», «Under 11 t hvile».

### 6.3 Forespørsler og timer
- Egen side for alt som venter (fri, bytter, ledige, fravær og timer), med filter og «Godkjenn alle som er i orden».
- Timer: per ansatt og uke, med avvik markert. Godkjente timer går rett til Lønn i regnskapet.

### 6.4 Ansatte
- Tabell (PC) eller kort (mobil): navn, stilling, avtale, tilgang (invitert / logget inn), timer denne måneden, og handlingene Endre og Inviter.
- Vis hvor mange ansatte som er med i pakken: «6 ansatte. 5 er med i Start, 1 er ekstra (29 kr/mnd)».

### 6.5 Innstillinger for vaktplanen: lederen bestemmer (viktig)
Lag en tydelig side der lederen **slår funksjoner av og på**. Hver funksjon får en rad med navn, én setning om hva den gjør, en bryter og eventuelle under-valg som vises når den er på. Det som er av, forsvinner helt for de ansatte.

| Funksjon | Under-valg når den er på |
|---|---|
| Ansatte ser kollegers vakter | Vis navn / bare «opptatt» |
| Ledige vakter | Hvem som får ta: lederen velger / først til mølla. Vis advarsel om overtid. |
| Bytte vakter | Kreves godkjenning fra leder: ja/nei. Bare med kolleger med samme vakttype. |
| Gi bort vakt | Frist: minst X timer før vakten |
| Tilgjengelighet | Enkel (dager) / detaljert (tidsrom). Frist: senest X dager før uka publiseres. |
| Fravær | Hvilke typer kan søkes. Vis saldo. |
| Timeregistrering og godkjenning | Ansatte kan melde avvik. Automatisk godkjenning når timene stemmer med vakten. |
| Overtid og merarbeid | Tillegg 40 / 50 / 100 %. Grense per dag og uke (standard 9 t / 40 t). |
| Hviletid | Advar ved under 11 t mellom vakter |
| Kommentarer på vakter | — |
| Varsler | E-post (SMS senere). Hva som varsles: ny uke publisert, endringer, svar på forespørsler. |
| Assistent i vaktplanen | Bare i Selskap: «Lag neste uke», «Hvem kan ta en ledig vakt?» |

- Øverst: «Standard» og «Tilbakestill til standard».
- Til høyre på PC (under på mobil): en **forhåndsvisning**, «Slik ser det ut for de ansatte», som oppdateres mens man slår av og på.
- Endringer lagres med «Lagre», og man får en bekreftelse.

### 6.6 Assistenten (bare i Selskap)
- Panel som i resten av systemet, med forslag på siden: «Lag vaktplan for neste uke», «Hvem bør ta lørdag?», «Får noen overtid denne uka?»
- Assistenten lager **forslag-kort** som lederen godkjenner. Den publiserer aldri selv.

---

## 7. Alle formater (vis hver skjerm i alle)

| Format | Bredde | Navigasjon | Vaktplan |
|---|---|---|---|
| Mobil stående | 360–430 | Bunnmeny | Liste eller én dag om gangen med dagvelger (7 ruter øverst) |
| Mobil liggende | 640–930 (lav høyde) | Bunnmeny som smal sidestripe eller skjult, toppen kompakt | 3–4 dager side om side, rull vannrett |
| Nettbrett stående | 744–834 | Bunnmeny eller kollapset venstremeny med ikoner | Uke med 7 smale kolonner, eller liste med kalender over |
| Nettbrett liggende | 1024–1194 | Venstremeny med tekst | Full uke, detaljpanel til høyre ved trykk |
| PC | 1280–1600+ | Toppmeny (leder) / venstremeny (ansatt) | Full uke eller måned, sidepanel for detaljer, maks innholdsbredde ca. 1280 |

**Regler:**
- Aldri vannrett rulling av hele siden. Rutenett som er for brede, bytter til dag- eller listevisning.
- Aldri store tomrom. Er det for få kort til å fylle raden, går det siste kortet i full bredde, eller kolonnene tilpasses. Rettført-forsiden hadde dette problemet på stående iPad, og det skal ikke gjenta seg.
- Trykkflater minst 44 × 44 px på mobil og nettbrett.
- Faner skal stå på én linje på mobil; de kan heller rulle vannrett.
- Modal på PC blir ark nedenfra på mobil.
- Klokkeslett og timer i mono-skrift, så tallene står under hverandre.

---

## 8. Interaksjon og tilstander

- Alt kan trykkes på: dato (gå til dagen), navn (person-kort), vakt (detalj), brikke i kalenderen (dag), teller-merke (listen bak).
- Hover på PC: kort løftes litt, og et «+» vises i tomme ruter.
- Overganger: korte (150–250 ms) og rolige. Ark glir opp nedenfra.
- **Tilstander som skal vises:**
  - tom (ingen vakter, ingen forespørsler)
  - laster (skjelett-kort)
  - feil («Fikk ikke kontakt. Prøv igjen.»)
  - funksjon slått av (vises ikke)
  - utkast-uke (ansatte ser den ikke)
  - publisert
  - endringer ikke publisert
- Bekreftelser: liten melding nederst («Du har meldt interesse for lørdag») med «Angre» i 5 sekunder der det gir mening.
- Tilgjengelighet (a11y): god kontrast, fokusring, skjermleser-tekst på statusikoner, og farge aldri alene.

---

## 9. Hva vi vil ha tilbake

1. **En klikkbar prototype** (én HTML-fil, som tidligere runder) med:
   - **ansatt:** Oversikt, Tilpass oversikten, Vakter (liste, kalender, uke), Filter, Vaktdetalj, Ledige, Bytter, Tilgjengelighet (enkel og detaljert), Fravær, Timer, Min side
   - **leder:** Uke (med Trenger svar), Lag/endre vakt, Forespørsler og timer, Ansatte, Innstillinger for vaktplanen med forhåndsvisning, Assistent
   - en bryter øverst i prototypen for å bytte mellom **Ansatt og Leder** og mellom **mobil (stående og liggende), nettbrett (stående og liggende) og PC**
2. **«Claude Code - vaktplan v2.md»**: en beskrivelse til utvikleren, som tidligere runder. Den skal inneholde skjermene, komponentene, tekstene ordrett, hva som skjer ved hvert trykk, hvilke innstillinger som skjuler hva, og brytepunktene.
3. Bruk eksempeldataene i seksjon 4 overalt, så alt henger sammen.

Det som allerede finnes i systemet og **må fortsette å virke**:
- innlogging med lenke for ansatte
- publisering av uke med varsel
- ledige vakter med interesse
- bytte bort
- tilgjengelighet med «kan ikke» → forespørsel om fri
- overtid og merarbeid (9 t/dag, 40 t/uke, merarbeid for deltid)
- pause 30 min på vakter over 5,5 t
- timer som går til lønn
- 5 ansatte i Start, 15 i Selskap, 29 kr/mnd per ekstra
- assistent bare i Selskap

Nye ting her, som fravær med saldo, bytte med kollega, detaljert tilgjengelighet, kommentarer og innstillinger per funksjon, skal designes slik at de kan slås av og på hver for seg.
