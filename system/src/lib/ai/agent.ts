// Assistenten som agent: modellen får spørsmålet, velger verktøy, får svar fra regnskapet og skriver svaret.
// Endringer blir forslag (kort) som brukeren sender, registrerer eller setter på vent selv.

import { spor, valgtLeverandor, type Melding } from './modell';
import { VERKTOY, kjorVerktoy, type Ktx, type Kort } from './verktoy';

const DAGER = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

export function systemtekst(o: { foretak: string; orgform: string; mvaRegistrert: boolean; bruker: string; idag: string; klokke: string; kanEndre: boolean }): string {
  const d = new Date(`${o.idag}T12:00:00Z`);
  return `Du er assistenten i Rettført, et norsk regnskapssystem. Du hjelper ${o.bruker} i ${o.foretak} (${o.orgform}${o.mvaRegistrert ? ', MVA-registrert' : ', ikke MVA-registrert'}).
I dag er ${DAGER[d.getUTCDay()]} ${o.idag.split('-').reverse().join('.')}, klokken er ${o.klokke} (norsk tid).

Slik jobber du:
- Svar på norsk bokmål, kort og vennlig, som en dyktig kollega. Ingen lange innledninger.
- Tall om firmaet henter du ALLTID med verktøyene. Gjett aldri beløp. Verktøyene gir beløp i øre; skriv dem i kroner med mellomrom som tusenskille og komma som desimal (12 500,00 kr).
- Når brukeren vil at noe skal gjøres (lage faktura, registrere kostnad, registrere innbetaling, sende purring, kreditnota, MVA), bruk verktøyet for det. Det lager et forslag som vises som et kort med knapper. Si kort hva forslaget inneholder, og at brukeren kan trykke «Send»/«Registrer» eller «Sett på vent». Påstå aldri at noe er sendt eller registrert før brukeren har trykket.
- Mangler du noe for å lage forslaget (kunde, beløp, hva som er levert), spør kort om akkurat det. Finn kunden med sok_kunde før du lager faktura. Er det flere treff, spør hvilken.
- Er beløpet oppgitt «inkl. MVA» for en faktura, regn om til pris eks. MVA før du bruker lag_faktura.
- Vil brukeren se oversikter, bruk vis_-verktøyene: de viser grafer og tabeller brukeren kan trykke på. Kommenter kort det viktigste.
- Generelle spørsmål (regnskapsregler, skatt, MVA-satser, frister, dato, klokke, hverdagslige spørsmål) svarer du på selv. Satser og grenser kan endres hvert år: si det når det er relevant, og vis til skatteetaten.no for detaljer.
- Lønn kan du ikke kjøre ennå. Vis til Lønn-siden.
${o.kanEndre ? '' : '- Brukeren har bare lesetilgang. Du kan vise tall, men ikke lage forslag som endrer noe.\n'}- Du er «Rettførts assistent». Ikke nevn hvilken AI-modell eller leverandør du bygger på.`;
}

export interface Tur { role: 'user' | 'assistant'; content: string }

export async function svarSomAgent(k: Ktx, kontekst: Parameters<typeof systemtekst>[0], historikk: Tur[]): Promise<{ tekst: string; kort: Kort[] }> {
  const leverandor = await valgtLeverandor(k.db);
  const meldinger: Melding[] = [
    { role: 'system', content: systemtekst(kontekst) },
    ...historikk.slice(-14).map(t => ({ role: t.role, content: t.content.slice(0, 4000) })),
  ];
  const kort: Kort[] = [];
  for (let runde = 0; runde < 6; runde++) {
    const m = await spor(leverandor, meldinger, VERKTOY);
    meldinger.push({ role: 'assistant', content: m.content ?? '', tool_calls: m.tool_calls });
    if (!m.tool_calls?.length) return { tekst: (m.content ?? '').trim(), kort };
    for (const kall of m.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(kall.function.arguments || '{}'); } catch { /* tomt */ }
      let svar: unknown;
      try {
        const r = await kjorVerktoy(k, kall.function.name, args);
        svar = r.svar;
        if (r.kort) kort.push(r.kort);
      } catch (e) {
        svar = { feil: e instanceof Error ? e.message : 'Noe gikk galt.' };
      }
      meldinger.push({ role: 'tool', tool_call_id: kall.id, content: JSON.stringify(svar).slice(0, 12000) });
    }
  }
  return { tekst: 'Jeg brukte for mange steg på dette. Prøv å dele opp spørsmålet.', kort };
}
