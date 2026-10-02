# Rettført – start her (for Claude Code)

## Hva som ligger i mappen

| Fil | Hva |
|---|---|
| `Claude Code - nye flyter.md` | **Spesifikasjonen.** Grunnprinsipp (én hovedbok), produktstrategi, datamodell og alle flyter. Les denne først. |
| `Oppgaveliste.md` | Tidligere oppgaveliste for Byrå-visningen. |
| `prototyper/Rettfort Flyter.dc.html` | Klikkbar prototype – **Selskap-visningen** (bedriften). Fasit for UI, tekster og oppførsel. Trykk «Se demo» for omvisning. |
| `prototyper/Rettfort Demo v5.dc.html` | Klikkbar prototype – **Byrå-visningen** (regnskapsfører) + innlogging. |
| `prototyper/Forside med demo.dc.html` | Nettsiden / forsiden med priser. |
| `prototyper/support.js`, `prototyper/assets/` | Trengs for at prototypene skal åpnes i nettleseren. |

Prototypene åpnes direkte i nettleseren. De er **referanse for design og oppførsel**, ikke kode som skal gjenbrukes – tall er eksempeldata.

## Slik gjør du det

1. Lag et nytt, tomt prosjekt (mappe) på maskinen din, f.eks. `rettfort`.
2. Legg hele denne `leveranse`-mappen inn i prosjektet som `docs/design/`.
3. Åpne Claude Code i prosjektmappen og lim inn prompten under.
4. La Claude Code lage planen først. Les den, svar på spørsmålene, og be den så starte på fase 1.

## Prompt til Claude Code (kopier alt i boksen)

```
Du skal bygge Rettført, et norsk regnskapssystem for små bedrifter (Selskap-visning) og regnskapsbyråer (Byrå-visning).

Les i denne rekkefølgen:
1. docs/design/START HER.md
2. docs/design/Claude Code - nye flyter.md  (spesifikasjonen – følg grunnprinsippet om én dobbelt bokført hovedbok)
3. Åpne prototypene i docs/design/prototyper/ for å se UI, tekster og oppførsel. Rettfort Flyter.dc.html er hovedreferansen.

Lag en CLAUDE.md i roten som sier: «Følg docs/design/Claude Code - nye flyter.md. Prototypene i docs/design/prototyper er fasit for UI og tekster.»

Foreslå teknologivalg (anbefalt: Next.js + TypeScript + Postgres + Prisma, auth med e-post/magisk lenke) og en plan i faser før du skriver kode:
- Fase 1: Datamodell (bilag, postering, konto NS 4102, kontakt, organisasjon, bruker, medlemskap, byra_kunde, periode_laas) + hovedbok-motor med tester (debet = kredit, låste perioder, korrigering i stedet for sletting).
- Fase 2: Innlogging med valg Egen bedrift / Regnskapsfører, organisasjon, roller, invitasjon.
- Fase 3: Penger ut (kjøp med kvittering, kontovelger med søk, MVA-sjekk), Penger inn (faktura/tilbud/kvittering, KID MOD10, PDF), detaljsider, utkast.
- Fase 4: Bank (opplasting av kontoutskrift, matching med KID først), Rapporter, MVA-melding (beregning), Frister.
- Fase 5: Lønn, Innstillinger, Regnskapsfører-kobling, Byrå-visning.
- Senere: AI-lesing av kvittering og AI-kontovalg (kun Start/Selskap), EHF, innsending til Altinn/Skatteetaten, SAF-T-eksport.

Bruk norsk bokmål i alle tekster i appen, ordrett fra prototypene der det finnes. Spør meg hvis noe i spesifikasjonen er uklart før du bygger det.
```

## Viktig å vite

- **Det som krever avtaler/tilganger** (kan ikke Claude Code løse alene): innsending til Altinn/Skatteetaten (MVA, a-melding), EHF/Peppol-aksesspunkt, Brønnøysund-API (gratis, men krever registrering), AI-nøkkel (f.eks. Anthropic API) for kvitteringslesing. Bygg disse bak et grensesnitt med «testmodus» først.
- **Gratis-pakken** skal ikke bruke AI eller andre tjenester som koster penger per bruk.
- **Regnskapsregler** (bokføringsloven, MVA-satser, feriepenger, AGA-soner) står i spesifikasjonen, men bør kvalitetssikres av en regnskapsfører før lansering.
