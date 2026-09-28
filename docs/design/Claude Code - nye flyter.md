# Rettført – nye flyter (til Claude Code)

Prototype: `Rettfort Flyter.dc.html` (åpne i nettleser). Denne filen forklarer hva som skal bygges, hvorfor, og reglene bak. Prototypen er fasit for utseende og tekst; dette dokumentet er fasit for logikk.

## Grunnprinsipp: én hovedbok under alt

Alt i Rettført bygger på én dobbelt bokført hovedbok (debet/kredit). Ingen skjerm har egne tall.

- **Hver handling lager posteringer:** kjøp, faktura, innbetaling, bankbevegelse, lønnskjøring, MVA-oppgjør, manuell postering. Eksempel: kjøp 449 kr Telenor → debet 6900 359,20 / debet 2710 89,80 / kredit 1920 449,00.
- **Alle visninger regnes ut fra hovedboken:** Hjem, Rapporter, MVA, Bank (saldo i regnskapet), åpne poster, Frister (beløp), kontrollmotoren.
- **Posteringer endres aldri:** rettelser skjer med motpostering (kreditnota, korrigering), med logg over hvem og når. Perioder kan låses (MVA sendt, måned avstemt, år avsluttet).
- **Tabeller (minimum):** `bilag` (id, dato, type, kilde, vedlegg), `postering` (bilag_id, konto, debet, kredit, mva_kode, kontakt_id, prosjekt_id), `konto` (kontoplan NS 4102), `kontakt` (kunde/leverandør), `periode_laas`.
- **SAF-T** genereres direkte fra `postering` + `konto` + `kontakt`.

## Produktstrategi: én app, to visninger

Rettført er **regnskap som sjekker seg selv**. Kontrollmotoren er felles kjerne. Den brukes i to visninger:

| | Selskap | Byrå |
|---|---|---|
| Bruker | Bedriftseier | Regnskapsfører |
| Prototype | `Rettfort Flyter.dc.html` | `Rettfort Demo v5.dc.html` |
| Pakker | Gratis, Start (149), Selskap (249) | Byrå (1 490 inkl. 15 kunder) |
| Kjerne | Føre faktura, kjøp, MVA, lønn selv | Alle kunder i én arbeidsliste, kontroll oppå eget eller eksternt system |

**Koblingen:** en bedrift inviterer regnskapsføreren sin (skjerm «Regnskapsfører» i Selskap). Regnskapsføreren får bedriften inn i Byrå-arbeidslisten. Byrå-kunder kan på sin side flytte små kunder over på Rettført Gratis. Hver side selger den andre.

**Innlogging/registrering:** ett skjema med valget «Egen bedrift» / «Regnskapsfører». Bedrift → Selskap-visningen, regnskapsfører → Byrå-visningen. URL-parameter `rolle=bedrift` forhåndsvelger bedrift (brukes fra forsiden og prisene). Ny bedrift starter på Gratis.

**Datamodell (minimum):**
- `organisasjon` (type: `selskap` | `byra`, pakke)
- `bruker` ↔ `medlemskap` (organisasjon, rolle: eier | ansatt | regnskapsforer_full | regnskapsforer_les)
- `byra_kunde` (byra_id, selskap_id, status: invitert | aktiv) – kobler Byrå til Selskap
- Kontrollfunn lagres per selskap og vises både i Selskap og i Byrå-arbeidslisten.

**Forsiden** (`Forside med demo.dc.html`) snakker til begge: to knapper i toppen («Start gratis for bedriften» / «Jeg er regnskapsfører»), og prisene er Gratis / Start / Selskap / Byrå.

## Bakgrunn

Vi har sammenlignet med Fiken. Der fyller brukeren ut alt for hånd og legger ved kvitteringen etterpå. Menyene bruker regnskapsord (Superføring, Fri postering, Saldobalanse) og MVA-siden sier «Terminen er ikke ferdig» uten å si hva som mangler.

Prinsippet vårt: **brukeren sjekker, i stedet for å skrive.** Vi starter med dokumentet, fyller ut selv, og sier tydelig fra om hva som mangler før noe sendes.

## Designregler (gjelder alle skjermer)

- Font: Schibsted Grotesk (tekst), IBM Plex Mono (tall, org.nr, beløp).
- Farger: marine `#0B2545` (primær), bakgrunn `#F4F1EA`, kort `#fff`, kantlinjer `#E4DFD4` / `#D9D3C6`, sekundærtekst `#586174`, dempet `#8A909C`.
- Status: grønn OK `#E2F1E8` / `#1F7D52`, gul «se på dette» `#FBEFA8` / `#8A6A00`, nøytral `#EFEBE2` / `#586174`.
- Kort: radius 16–18px, 1px kant, ingen tunge skygger.
- Vanlige ord foran kontonummer: «Kontorrekvisita · 6800», aldri bare «6800».
- Tomme og ferdige tilstander får maskoten (`assets/mascot-hip.png`) og én tydelig knapp.

## 0. Velkomst (første innlogging for bedrift)

Starter fra forsiden («Start gratis for bedriften») eller når «Egen bedrift» velges ved registrering. URL: `Rettfort Flyter.dc.html?ny`. Fem steg + ferdig-skjerm:

1. **Lag kontoen:** navn, e-post, rolle (Eier eller leder / Regnskapsfører / Ansatt), passord (min. 8 tegn). Velger man Regnskapsfører, vises en lenke til Byrå-visningen.
2. **Bekreft e-post:** 6-sifret kode. Går videre av seg selv når koden er riktig. «Send på nytt» og «Feil e-post?».
3. **Finn foretaket:** søk i Brønnøysund (navn eller org.nr, min. 2 tegn). Valg fyller ut steg 4. «Foretaket er ikke registrert ennå» gir tomt skjema.
4. **Stemmer dette?:** navn, organisasjonsform, stiftelsesdato, org.nr, MVA-termin (ikke registrert / annenhver måned / årlig / månedlig), hver med én forklarende setning.
5. **Hvor starter du?:** Nytt foretak / Har regnskap et annet sted (velg system → SAF-T-import) / Excel eller papir (inngående saldoer).
6. **Ferdig:** viser hva som er satt opp: bilag-e-post (slug av firmanavn), frister ut fra organisasjonsform og MVA-termin, kontoplan og fakturanummer, og neste steg ut fra valget i steg 5. «Gå til Hjem».

Forskjell fra Fiken: vi søker foretaket *før* opplysningene, så brukeren bekrefter i stedet for å skrive.

## 1. Hjem

- To store knapper: **Penger inn** (→ Ny faktura) og **Penger ut** (→ Nytt kjøp). Kunden tenker på hva som skjedde, ikke på regnskapsbegreper.
- Kort «Neste frist»: viser antall ting som mangler og knapp «Se hva». Når alt er løst: maskot + «MVA 10. oktober er klar».
- Kort med egen bilag-e-post (`<firmaslug>@bilag.rettfort.no`) og Kopier-knapp.
- «Sist registrert»: siste 3 hendelser, merket Penger inn / Penger ut.

## 2. Nytt kjøp (Penger ut): kvittering først

Tilstander: `tom` → `leser` → `klar` → `reg`.

1. **tom:** slippsone for bilde/PDF/EHF + «Fyll ut uten kvittering».
2. **leser:** kvitteringen vises til venstre med skannelinje. Feltene fylles ett og ett (leverandør, dato, hva er kjøpt, totalt, MVA). Linjen på kvitteringen som leses, markeres gult; ferdig leste linjer blir grønne. Felt som er lest, får merket «Lest fra kvittering».
3. **klar:** alle felt kan redigeres. Konto foreslås med vanlige ord ut fra varene.
4. **reg:** bekreftelse med bilagsnummer.

Kontroll før registrering (kjøres live når feltene endres):
- Summen: MVA ≈ 20 % av totalen ved 25 % sats (netto + MVA = total). Avvik → gul.
- Ny leverandør: slå opp i Brønnøysund; tilby «Legg til» med org.nr.
- Duplikat: samme leverandør + beløp + dato finnes ikke fra før.
- Registrer-knappen er aktiv når leverandør og total er fylt. Hvis det finnes åpne funn, heter den «Registrer likevel».

## 3. Ny faktura (Penger inn)

- **Kunde via søk:** skriv minst 2 tegn, søk i Brønnøysundregistrene (navn eller org.nr). Velg → adresse og e-post fylles ut. «Hentet fra Brønnøysund» vises.
- Sjeldne felt (forfall, referanser, språk, valuta) ligger skjult bak «+ Forfall, referanse og flere valg».
- **Linjer:** beskrivelse, antall, pris, MVA (25/15/12/0).
- **Live forhåndsvisning** til høyre, oppdateres ved hvert tastetrykk. Ingen egen Forhåndsvis-knapp.
- Manglende org.nr hos avsender: én gul linje med knapp «Hent fra Brønnøysund», ikke en stor rød tekstboks.
- Send er aktiv når kunde er valgt og netto > 0. Sendes som e-post med PDF, EHF hvis mottaker støtter det.

## 4. MVA: steg som viser hva som mangler

Fire steg, låses opp i rekkefølge:
1. **Alle bilag er på plass:** liste over banktransaksjoner uten bilag, med «Be om kvittering» / «Last opp».
2. **Kontrollen har ikke funnet noe:** funn fra kontrollmotoren (f.eks. feil MVA-sats på servering), med knapp for å rette.
3. **Se over tallene:** MVA på salg, MVA på kjøp, å betale. Vises først når 1 og 2 er løst.
4. **Send til Altinn** (BankID).

Toppen viser alltid status: «N ting mangler før du kan sende» / «Klar til å sende» / «Sendt».

## 5. Frister

- Liste neste 3 måneder med status per frist (Klar / N ting mangler / Åpner dato).
- E-postpåminnelser: 7 dager før, og dagen før hvis noe fortsatt mangler.
- Kalenderabonnement (ICS-lenke) for Google, Apple og Outlook.

## 8. Lønn (med i alle pakker)

Fiken krever et langt skjema med 15+ felt (virksomhetsnummer, beregningskode, kommunenummer, advarsler) før man får se lønn. Vi gjør dette i stedet:

**Oppsett:** tre spørsmål (ferie 10,2 % / 12 %, lønningsdag, OTP ja/nei/vet ikke). Ved siden av vises alt vi har fylt ut selv, med forklaring: virksomhetsnummer (Brønnøysund, underenhet), arbeidsgiveravgift ut fra kommune/sone, arbeidstid 37,5 t, skattekort (hentes fra Skatteetaten), bankkonto.

**Lønnskjøring per måned:** liste over ansatte med netto; velg én for å redigere (fastlønn eller timer × sats, tillegg). Live lønnslipp til høyre. Kontroll før kjøring: skattekort hentet, uvanlig antall timer, arbeidsgiveravgift, feriepenger.

**Kjør lønn** gir: lønnslipper på e-post, betalingsfil til nettbank, A-melding sendes før den 5., skattetrekk og AGA lagt inn som frist den 15., og føring i regnskapet (5000/5400/2600/2770).

Beregning i prototypen er forenklet (prosenttrekk). Ekte versjon: tabelltrekk fra skattekort, feriepengegrunnlag og OTP.

## 7. Regnskapsfører (i Selskap)

- Inviter på e-post, velg rolle: «Full tilgang» (kan føre og sende MVA) eller «Se og kommentere».
- Etter invitasjon: kort med status (venter / aktiv) og «Fjern tilgang».
- Oppretter rad i `byra_kunde` med status `invitert`. Når regnskapsføreren godtar, blir den `aktiv` og selskapet vises i Byrå.

## 8. Bank (bankavstemming med kontoutskrift)

Ingen bankkobling. Brukeren laster opp kontoutskrift (PDF eller bilde) én gang i måneden. Prototype: skjerm «Bank» i `Rettfort Flyter.dc.html`.

**Prosess:**
1. Last opp kontoutskrift for måneden.
2. Les bevegelser (dato, tekst, beløp, inngående og utgående saldo). Start/Selskap: AI-lesing. Gratis: brukeren laster opp CSV fra nettbanken eller fyller inn selv.
3. Match hver bevegelse mot regnskapet:
   - utbetaling ↔ registrert kjøp (samme beløp, dato ±5 dager, lik leverandør)
   - innbetaling ↔ åpen faktura (beløp + KID/fakturanr) → faktura markeres betalt
   - kvittering i «Trenger en titt» → godkjennes samtidig
   - renter/gebyr → føres automatisk
4. Uten treff: brukeren velger «Ta bilde av kvitteringen», «Hent fra e-post», «Uttak til meg selv» (egenkapital/privat) eller «Overføring til egen konto».
5. Vis saldo i banken og saldo i regnskapet side om side. Like → «Stemmer» → «Merk måneden som ferdig» (låses).

**Kobling til andre deler:** Hjem og MVA varsler hvis forrige måned ikke er ferdig. Kontrollmotoren sjekker at utgående saldo = saldo på konto 1920.

**Datamodell:** `kontoutskrift` (konto, måned, fil, IB, UB, status), `bankbevegelse` (dato, tekst, beløp, match_type, match_id, status).

## 9. Rapporter

Én side. Prototype: skjerm «Rapporter» i `Rettfort Flyter.dc.html`. Ingen filterpanel; én periode (hittil i år) som standard.

1. **Tre svar øverst:** Tjener jeg penger? (resultat + endring mot i fjor), Hva har jeg? (bank + kundefordringer), Hva skylder jeg? (leverandørgjeld + MVA/skatt, med nærmeste frist).
2. **Hva pengene kommer fra og går til:** to stablede stolper (inntekter, utgifter) gruppert på kontogrupper. Klikk på en del → siste poster i gruppen.
3. **Måned for måned:** inn/ut per måned. Start/Selskap: AI-kommentar når en måned avviker (> 2× snitt i en kategori). Gratis: kun grafen.
4. **Åpne poster:** kunder som skylder (med purring på forfalte) og det du skylder.
5. **For regnskapsføreren:** faner Resultatregnskap, Balanse, Saldobalanse, Hovedbok + Excel/PDF/SAF-T.

Lønnsrapporter ligger i Lønn, MVA-grunnlag i MVA. Kjørebok, aksjeeierbok, eiendelsregister og periodisering kommer senere.

## 10. Salg og kjøp (forbedret fra Fiken)

- **Ett skjema for salg** med valg øverst: Faktura · Tilbud · Kvittering (betalt nå). Tekster, forhåndsvisning og knapp følger valget. Ordrebekreftelse og «salg fra annet system» er ikke med.
- **«Send samme faktura hver måned»** er en avkrysning på fakturaen, ikke en egen side. Lagres som `gjentakelse` (intervall, neste dato, stopp).
- **Enkle ord:** «Beløp med MVA», «Hva slags kjøp er dette?», «Betalt med firmakort», én «Referanse, hvis kunden har bedt om det» under «flere valg».
- **Filtre i oversiktene:** Salg: Alle · Ikke betalt · Forfalt. Kjøp: Alle · Ikke betalt · Mangler kvittering. Tom liste gir én setning.
- **Viderefakturering:** avkrysning på kjøp «Skal faktureres videre til en kunde» + velg kunde. Når det lages faktura til kunden, vises forslag «Du har X kr … Legg til på fakturaen». Linjen merkes brukt når fakturaen sendes.
- **Del beløpet på flere typer kjøp:** lenke under kontovalg. Rader med konto + beløp, og «X kr gjenstår å fordele» til summen går opp. Én postering per rad.
- **EHF:** sendes automatisk når mottaker støtter det; mottatte EHF havner i «Trenger en titt».
- **Din info på dokumentet:** egen seksjon i salgsskjemaet (lukket som standard, viser sammendrag). Kan endre firmanavn, adresse, kontonummer, e-post/telefon og tekst nederst, og laste opp, bytte eller fjerne logo. «Bruk dette på alle nye …» lagrer som standard i `firma_innstillinger`; ellers gjelder endringen bare dette dokumentet (lagres på `faktura`). «Tilbakestill til standard». Org.nr endres kun i innstillinger (hentes fra Brønnøysund).

## 11. KID og lovpålagt innhold på faktura

**KID (kundeidentifikasjon):** et nummer kunden oppgir når de betaler, slik at innbetalingen kan kobles til riktig faktura automatisk.
- Genereres for hver faktura: fakturanummer + kundenummer (4 siffer) + kontrollsiffer (MOD10/Luhn). MOD11 som valg i innstillinger.
- Vises tydelig på fakturaen og i EHF (`PaymentID`).
- **Bankavstemming:** KID leses fra kontoutskriften og brukes som første matchregel (før beløp/dato/navn).
- Hvis kunden betaler uten KID: fall tilbake på beløp + navn, og vis «Betalt uten KID, stemmer det?».
- Senere (valgfritt): KID-/OCR-avtale med banken gir egen innbetalingsfil. Ikke nødvendig i første versjon.

**Obligatorisk på salgsdokument (bokføringsforskriften § 5-1-1), sjekk før sending:**
- Fakturanummer (løpende, uten hull) og fakturadato
- Selgers navn, adresse og org.nr + «MVA» hvis MVA-registrert; «Foretaksregisteret» for AS/ASA
- Kjøpers navn og adresse (org.nr for næringskunder)
- Beskrivelse, antall, pris, MVA-sats og MVA-beløp per sats, totalsum
- Leveringsdato/-periode og leveringssted hvis annet enn kjøpers adresse
- Forfallsdato og betalingsinformasjon (kontonr + KID)
- Kreditnota må vise til opprinnelig faktura.

Kontrollmotoren stopper sending hvis noe mangler og sier hva («Org.nr mangler»).

## 12. Innstillinger (bedrift)

Én side med faner: Firma · Faktura · Brukere · Varsler · Abonnement · Avansert.
- **Firma:** oversikt over opplysninger: org.nr (med kopier-knapp), selskapsform, etablert dato, regnskap i Rettført fra (med forklaring om åpningsbalanse), MVA-registrert fra, MVA-termin, regnskapsår, bransje (NACE). Navn, org.nr og selskapsform hentes fra Brønnøysund (skrivebeskyttet, synkes daglig). Adresse og kontakt kan endres. MVA-termin: annenhver måned / årstermin / ikke registrert, med frister forklart. Ikke-registrerte varsles når salget nærmer seg 50 000 kr.
- **Faktura:** logo (last opp/bytt/fjern), kontonummer, dager til forfall, tekst nederst. Brytere: EHF når mulig, se om faktura er åpnet, KID, automatisk påminnelse (3 og 14 dager etter forfall). Samme verdier som «Din info på dokumentet» – standard her, overstyring per dokument.
- **Brukere:** liste med roller. Inviter med e-post og én av tre roller: Full tilgang · Kan se, ikke endre · Kun kvitteringer og utlegg. Regnskapsfører invitert fra «Regnskapsfører» vises også her.
- **Varsler:** brytere for frister, ubetalte fakturaer, kvitteringer som trenger en titt, regnskapsføreren spør. Kanal: e-post / push / SMS (flere valg).
- **Abonnement:** Gratis / Start / Selskap med bytt opp/ned. Opp gjelder straks, ned fra neste måned. Lønn inkludert uten pris per ansatt. Ingen bindingstid.
- **Avansert:** lås regnskapet til og med dato (låses automatisk etter sendt MVA), datadeling (av som standard), eksport av alt (SAF-T + PDF + bilag), avslutt konto (krever passord, eksport først).

## 13. Velge konto på kjøp

Brukeren ser aldri hele kontoplanen som liste. Feltet heter «Hva slags kjøp er dette?».
- **Valgt konto** vises som navn + én setning + kontonr (lite). «Endre» åpner velgeren.
- **Søk med vanlige ord:** hver konto har søkeord (strøm, bil, verktøy, kaffe …). Søk treffer navn, beskrivelse, søkeord og nummer. Maks 8 treff.
- **Du bruker oftest:** de 5 mest brukte kontoene for dette firmaet vises når søket er tomt.
- **La AI velge (Start/Selskap):** leser leverandør, varelinjer og tidligere føringer fra samme leverandør, velger konto og forklarer hvorfor i én setning («Kvitteringen fra Circle K gjelder drivstoff …»). Brukeren kan alltid endre. Gratis: knappen vises låst, søk fungerer.
- **Regel først, AI etterpå:** samme leverandør som før → samme konto uten AI-kall (gratis).
- **MVA-sjekk mot Brønnøysund** i kontrollen før registrering: finnes ikke leverandøren i MVA-registeret → «Fant ikke X i MVA-registeret … får ikke fradrag» + «Sett MVA til 0» (kan angres). Ingen popup.

## 14. Detaljside for faktura og kjøp + utkast

Klikk på en rad i «Alle fakturaer» / «Alle kjøp» åpner detaljsiden (tilbake-lenke øverst).
- **Faktura:** dokumentet slik kunden ser det (med KID), status og beløp øverst, tidslinje «Hva har skjedd» (sendt, åpnet, forfalt, påminnelse, betalt – «funnet i banken med KID», kreditert). Handlinger: Registrer betaling · Send påminnelse · Send på nytt · Last ned PDF · Krediter.
- **Kreditnota:** hele eller deler (beløp), grunn som kunden ser. Viser til opprinnelig faktura. Status «Kreditert».
- **Kjøp:** kvitteringen, «Hvor det er ført» (konto, hvilken MVA-periode, kvittering lagret/mangler). Handlinger: Rett · Registrer betaling · Legg ved ny kvittering · Slett.
- **Rett = korrigering**, aldri overskriving (se grunnprinsippet). **Låst periode** (MVA sendt): Rett/Slett skjules, forklaring vises, korrigering føres i neste periode.
- **Utkast:** halvferdige kjøp/fakturaer lagres automatisk og vises øverst i oversiktene med «Fortsett» og «Slett».

## 6. Årsavslutning

- **Steg 0: Løpende kontroll** hele året, med månedsstripe (grønn = kontrollert uten åpne funn, gul = pågår).
- Steg 1–3 som i dag hos andre (avslutt regnskap → skattemelding → årsregnskap), men hvert steg sier hva vi *allerede* har gjort.

## Pakker: hva koster oss penger

| Funksjon | Gratis | Start og opp |
|---|---|---|
| Penger inn/ut, faktura, kjøp manuelt | Ja | Ja |
| Bilag-e-post (mottak og lagring) | Ja | Ja |
| Regelbasert kontroll (sum, duplikat, Brønnøysund-oppslag) | Ja | Ja |
| Frister, e-postpåminnelser, kalender | Ja | Ja |
| Lønnslipper | Ja | Ja |
| Automatisk lesing av kvittering (AI/OCR) | Nei | Ja |
| AI-kontroll og assistent | Nei | Ja |
| Bankkobling (API) | Nei | Ja |

Pakker for bedrifter: Gratis (0), Start (149, AI-lesing og nattlig kontroll), Selskap (249, + bank og assistent). Byrå 1 490.

I prototypen styres dette med prop `pakke` (`Start` | `Gratis`). I Gratis står kvitteringen ved siden av tomme felt, med en forklaring om at automatisk lesing er med i Start.

## Tekniske notater

- Brønnøysund: åpent API `https://data.brreg.no/enhetsregisteret/api/enheter?navn=<q>` (gratis, ingen nøkkel).
- Kvitteringslesing: send bildet til OCR/AI-tjenesten, returner feltene `leverandor, orgnr, dato, linjer[], total, mva`. Vis feltene fortløpende (strømmet) for å få samme effekt som i prototypen.
- Kontoforslag: regel først (nøkkelord → konto), AI som reserve i betalte pakker.
- MVA-steg: status beregnes fra (a) banktransaksjoner uten bilag i perioden, (b) åpne funn fra kontrollmotoren. Steg 3–4 er låst til begge er 0.
- All tekst i prototypen er ferdig formulert og kan brukes direkte.
