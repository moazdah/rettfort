// Tolker teksten fra en kvittering eller faktura (fra tekstgjenkjenning eller PDF) og kryss-sjekker tallene.
//
// Grunnregel: et beløp regnes bare som sikkert når minst to uavhengige kilder på kvitteringen er enige,
// for eksempel «Totalt» = kortbetalingen = summen av varelinjene, eller at MVA passer med totalen.
// Tekstgjenkjenning mister lett et komma (163,80 blir 16380) eller en null. Slike feil fanges fordi
// tallet da ikke lenger stemmer med de andre. Alt som ikke kan bekreftes, merkes «sjekk».
//
// Brukes både i nettleseren (demoen på rettført.no) og i systemet. Ingen avhengigheter.
// Beløp returneres i øre (heltall).

const SATSER = [25, 15, 12];

/** Retter typiske feil fra tekstgjenkjenning inne i tall: O→0, l/I/|→1, S→5, B→8 når de står mellom sifre. */
function rettSiffer(l) {
  return l
    .replace(/(?<=\d)[Oo](?=[\d,. ]|$)|(?<=[\d,. ])[Oo](?=\d)/g, '0')
    .replace(/(?<=\d)[lI|](?=[\d,.])|(?<=[\d,.])[lI|](?=\d)/g, '1')
    .replace(/(?<=\d)S(?=\d)/g, '5')
    .replace(/(?<=\d)B(?=\d)/g, '8')
    .replace(/(\d)\s+[,.]\s*(\d{2})(?![\d./])|(\d)[,.]\s+(\d{2})(?![\d./])/g, (m, a, b, c, d) => `${a ?? c},${b ?? d}`) // «163 ,80» og «163, 80»
    .replace(/(?<![\d.\/])(\d{1,3}(?:[ \u00a0]\d{3})*|\d+)\.(\d{2})(?![\d.\/])/g, '$1,$2'); // 163.80 → 163,80 (ikke datoer)
}

/** Finner beløp i en linje. «sikker» = med to desimaler eller «,-». */
function belopILinje(l) {
  const ut = [];
  const re = /(-)?(\d{1,3}(?:[ . ]\d{3})+|\d+)(?:,(\d{2})|(,-|\.-))?(?![\d])/g;
  let m;
  while ((m = re.exec(l))) {
    const heltall = m[2].replace(/[ . ]/g, '');
    if (heltall.length > 9) continue;
    const des = m[3] || '00';
    const sikker = !!(m[3] || m[4]);
    // Heltall uten desimaler er ofte antall, tid, nummer eller et beløp der kommaet er borte. De tas med som svake kandidater.
    if (/^\s*%/.test(l.slice(m.index + m[0].length))) continue; // «15 %» er en sats, ikke et beløp
    const ore = Number(heltall) * 100 + Number(des);
    // «Vare 2 337,09»: «2» kan høre til varenavnet. Husk lesingen uten første tusengruppe som et alternativ.
    const grupper = m[2].split(/[ \u00a0]/);
    const alt = grupper.length === 2 && grupper[0].length <= 2 ? Number(grupper[1]) * 100 + Number(des) : null;
    ut.push({ ore: m[1] ? -ore : ore, alt: alt == null ? null : (m[1] ? -alt : alt), sikker, pos: m.index, slutt: m.index + m[0].length, altPos: alt == null ? null : m.index + m[0].indexOf(grupper[1]) });
  }
  return ut;
}

// Ordgrenser som også tar hensyn til æ, ø og å (JavaScripts \b gjør ikke det).
const ord = kjerne => new RegExp('(?<![A-Za-zÆØÅæøå])(?:' + kjerne + ')(?![A-Za-zÆØÅæøå])', 'i');
const RE = {
  total: ord('totalt?|total\\s*nok|sum(?!\\s*(?:eks|ekskl|u\\.?\\s*mva|uten))|å\\s*betale|a\\s*betale|til\\s*betaling|beløp|belop|totalsum|amount'),
  delsum: ord('delsum|subtotal|sub\\s*total|mellomsum'),
  netto: ord('eks\\.?\\s*mva|ekskl\\.?\\s*mva|u\\.?\\s*mva|uten\\s*mva|netto|grunnlag|sum\\s*eks'),
  mva: ord('mva|moms|merverdi\\w*|vat|herav'),
  betaling: ord('bankkort|bank\\s*kort|visa|mastercard|master\\s*card|maestro|kort|bax|terminal|vipps|kontant|betalt|debit|kredit\\w*|amex|apple\\s*pay|google\\s*pay|bankaxept|kjøp'),
  ignorer: ord('veksel|tilbake|avrund\\w*|org\\.?\\s*nr|org\\.?\\s*no|organisasjon\\w*|tlf|telefon|kvittering\\s*nr|kasse|bong|ref\\w*|kid|konto\\w*|dato|kl\\.?|tid|ordre\\w*|faktura\\s*nr|kundenr\\w*|side|poeng|bonus'),
};

function satsILinje(l) {
  const m = l.match(/(\d{1,2})(?:[,.]\d+)?\s*%/);
  return m ? Number(m[1]) : null;
}

/** Org.nr med kontrollsiffer (MOD11). */
export function gyldigOrgnr(o) {
  const d = String(o || '').replace(/\D/g, '');
  if (d.length !== 9) return false;
  const v = [3, 2, 7, 6, 5, 4, 3, 2];
  const s = v.reduce((a, w, i) => a + w * Number(d[i]), 0);
  const k = 11 - (s % 11);
  return (k === 11 ? 0 : k) === Number(d[8]) && k !== 10;
}

function tilIso(d, m, y) {
  const aar = y.length === 2 ? 2000 + Number(y) : Number(y);
  const mm = Number(m), dd = Number(d);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${aar}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

const naer = (a, b, tol = 2) => Math.abs(a - b) <= tol; // øre

/** MVA som passer med en total for en av satsene. */
function mvaFor(total, sats) { return Math.round((total * sats) / (100 + sats)); }

/**
 * @param {string} tekst Teksten fra kvitteringen.
 * @param {{ idag?: string }} [opts]
 */
export function tolkKvittering(tekst, opts = {}) {
  const raa = String(tekst || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const linjer = raa.map(rettSiffer);
  const alle = [];
  linjer.forEach((l, i) => {
    const typer = [];
    if (/org\.?\s*(nr|no|nummer)|organisasjon|foretaksreg/i.test(l)) { alle.push({ i, l, raa: raa[i], typer: ['ignorer'], belop: [], siste: null, sats: null }); return; }
    if (RE.total.test(l)) typer.push('total');
    if (RE.delsum.test(l)) typer.push('delsum');
    if (RE.netto.test(l)) typer.push('netto');
    if (RE.mva.test(l) && !RE.netto.test(l)) typer.push('mva');
    if (RE.betaling.test(l)) typer.push('betaling');
    if (RE.ignorer.test(l)) typer.push('ignorer');
    const b = belopILinje(l);
    // Beløpet lengst til høyre i linjen er det som gjelder (venstre kan være antall eller pris per stk).
    const siste = b.length ? b[b.length - 1] : null;
    alle.push({ i, l, raa: raa[i], typer, belop: b, siste, sats: satsILinje(l) });
  });

  const med = t => alle.filter(x => x.typer.includes(t) && x.siste);
  const totalLinjer = med('total').filter(x => !x.typer.includes('mva') && !x.typer.includes('netto'));
  const betaling = med('betaling').filter(x => !x.typer.includes('mva') && x.siste.ore > 0);
  const mvaLinjer = med('mva');
  const nettoLinjer = med('netto');
  const satserPaaKvittering = [...new Set(alle.map(x => x.sats).filter(s => SATSER.includes(s)))];

  // Varelinjer: tekst og et beløp til slutt, ikke summer, MVA, betaling eller annet.
  const forsteSum = Math.min(...[...totalLinjer, ...med('delsum'), ...mvaLinjer, ...betaling].map(x => x.i), Infinity);
  const varer = alle.filter(x => x.siste && x.siste.sikker && x.i < forsteSum && x.typer.length === 0 && /[A-Za-zÆØÅæøå]{2}/.test(x.l.slice(0, x.siste.pos)))
    .map(x => ({ tekst: x.l.slice(0, x.siste.pos).replace(/\s+\d+\s*[x*]\s*$/i, '').replace(/[\s.:-]+$/, '').trim(), ore: x.siste.ore, alt: x.siste.alt, altTekst: x.siste.alt == null ? null : x.l.slice(0, x.siste.altPos).replace(/[\s.:-]+$/, '').trim() }));
  // Alle mulige varesummer når noen linjer kan leses på to måter (maks 2^8 kombinasjoner).
  const tvetydige = varer.map((v, i) => (v.alt != null ? i : -1)).filter(i => i >= 0).slice(0, 8);
  const vareSummer = [];
  for (let mask = 0; mask < (1 << tvetydige.length); mask++) {
    let sum = 0; varer.forEach((v, i) => { const j = tvetydige.indexOf(i); sum += j >= 0 && (mask >> j) & 1 ? v.alt : v.ore; });
    vareSummer.push({ sum, mask });
  }
  const velgVarer = T => {
    const b = vareSummer.reduce((a, x) => (Math.abs(x.sum - T) < Math.abs(a.sum - T) ? x : a), vareSummer[0] || { sum: 0, mask: 0 });
    varer.forEach((v, i) => { const j = tvetydige.indexOf(i); if (j >= 0 && (b.mask >> j) & 1) { v.ore = v.alt; v.tekst = v.altTekst; v.alt = null; } });
    return b.sum;
  };
  let vareSum = vareSummer.length ? vareSummer[0].sum : 0;
  const vareSumPasser = T => vareSummer.some(x => naer(x.sum, T));
  const varerAntall = () => varer.length;

  // Kandidater for totalen, med varianter for tapt komma eller null.
  const kandidater = new Map();
  const leggTil = (ore, kilde, variant) => {
    if (!(ore > 0) || ore > 1e11) return;
    const k = kandidater.get(ore) || { ore, kilder: new Set(), variant: true };
    k.kilder.add(kilde); if (!variant) k.variant = false;
    kandidater.set(ore, k);
  };
  const medVarianter = (ore, kilde, sikker) => {
    leggTil(ore, kilde, false);
    // Et beløp uten desimaler kan være et beløp der kommaet er borte (16380 → 163,80).
    if (!sikker) leggTil(Math.round(ore / 100), kilde + '?', true);
    leggTil(ore * 10, kilde + '?', true); leggTil(Math.round(ore / 10), kilde + '?', true);
  };
  totalLinjer.forEach(x => medVarianter(x.siste.ore, 'totallinje', x.siste.sikker));
  betaling.forEach(x => medVarianter(x.siste.ore, 'betaling', x.siste.sikker));
  if (varer.length) for (const x of vareSummer) leggTil(x.sum, 'varesum', false);
  if (!kandidater.size) {
    const sikre = alle.flatMap(x => x.belop.filter(b => b.sikker && b.ore > 0));
    if (sikre.length) leggTil(Math.max(...sikre.map(b => b.ore)), 'største beløp', false);
  }

  const mvaVerdier = mvaLinjer.flatMap(x => x.belop.filter(b => b.ore > 0 && b.sikker).map(b => ({ ...b, sats: x.sats })));
  // Avrunding per varelinje kan gi noen få øre forskjell, aldri mer.
  const tol = Math.max(2, 1 + Math.ceil(varerAntall() / 2));
  const nettoVerdier = nettoLinjer.map(x => x.siste.ore);
  const satserSomProves = satserPaaKvittering.length ? satserPaaKvittering : SATSER;

  const vurder = T => {
    const kilder = new Set();
    // Direkte lest (uten korreksjon) på en totallinje eller betalingslinje.
    for (const x of totalLinjer) if (x.siste.ore === T) kilder.add('Totalt');
    for (const x of betaling) if (x.siste.ore === T) kilder.add('Betalingen');
    if (varer.length >= 2 && vareSumPasser(T)) kilder.add('Summen av varene');
    // MVA-linje som passer med totalen, én sats eller summen av flere satser.
    let mva = null, sats = null;
    for (const v of mvaVerdier) {
      for (const s of v.sats ? [v.sats] : satserSomProves) if (naer(v.ore, mvaFor(T, s), tol)) { mva = v.ore; sats = s; }
    }
    if (mva != null) kilder.add('MVA');
    // Flere satser: summen av MVA-linjene må ligge mellom laveste og høyeste sats. Det er ikke en bekreftelse, bare et rimelig tall.
    let blandet = false;
    if (mva == null && mvaVerdier.length > 1) {
      const sum = mvaVerdier.reduce((a, v) => a + v.ore, 0);
      const lav = mvaFor(T, Math.min(...satserSomProves)), hoy = mvaFor(T, Math.max(...satserSomProves));
      if (sum >= lav - tol && sum <= hoy + tol) { mva = sum; sats = null; blandet = true; }
    }
    for (const n of nettoVerdier) for (const v of mvaVerdier) if (naer(n + v.ore, T, 1)) { kilder.add('Netto + MVA'); if (mva == null) { mva = v.ore; } }
    return { kilder, mva, sats, blandet };
  };

  let best = null;
  for (const k of kandidater.values()) {
    const v = vurder(k.ore);
    // En korrigert variant må ha minst to uavhengige bekreftelser for å slå et tall som faktisk står der.
    const poeng = v.kilder.size * 10 + (k.variant ? -15 : 0) + (k.kilder.has('totallinje') ? 2 : 0) + (k.kilder.has('betaling') ? 1 : 0);
    if (k.variant && v.kilder.size < 2) continue;
    if (!best || poeng > best.poeng || (poeng === best.poeng && k.ore > best.ore)) best = { ...k, ...v, poeng };
  }

  const status = {}, grunn = {};
  let total = null, mva = null, sats = null;
  if (best) {
    total = best.ore; mva = best.mva; sats = best.sats;
    if (varer.length) vareSum = velgVarer(total);
    const k = [...best.kilder];
    if (k.length >= 2) { status.total = 'bekreftet'; grunn.total = `${k.join(', ')} stemmer overens.`; }
    else { status.total = 'sjekk'; grunn.total = k.length ? `Bare lest fra ${k[0].toLowerCase()}. Sjekk beløpet mot kvitteringen.` : 'Fant ingen tydelig total. Sjekk beløpet.'; }
    if (best.variant) grunn.total = `Tallet var lest feil og er rettet ut fra ${k.join(' og ').toLowerCase()}. Sjekk at ${kr(total)} kr stemmer.`;
    if (best.variant) status.total = 'sjekk';
    // Står det et annet tall ved «Totalt» enn det som ble valgt, skal brukeren alltid se på det.
    const direkte = [...totalLinjer.map(x => ['«Totalt»', x.siste]), ...betaling.map(x => ['Betalingen', x.siste]), ...(varer.length ? [['Summen av varene', { ore: vareSum }]] : [])];
    // Varesummen kan avvike litt (pant, antall, netto på fakturaer). Den slår bare alarm når størrelsesordenen er en helt annen,
    // som når en null er tapt eller lagt til. Totalt og betalingen må stemme på øret.
    const annenOrden = (a, b) => a > 0 && b > 0 && Math.max(a, b) / Math.min(a, b) >= 3;
    const uenig = direkte.find(([navn, b]) => navn === 'Summen av varene' ? annenOrden(b.ore, total) : b.ore !== total);
    if (uenig) {
      status.total = 'sjekk';
      grunn.total = `${uenig[0]} ble lest som ${kr(uenig[1].ore)} kr, men ${k.join(' og ').toLowerCase()} gir ${kr(total)} kr. Sjekk hva som står på kvitteringen.`;
    }
  } else { status.total = 'mangler'; grunn.total = 'Fant ikke totalbeløpet.'; }

  const mvaLinjeFinnes = alle.some(x => x.typer.includes('mva'));
  if (total != null && mva != null) {
    status.mva = status.total === 'bekreftet' && !best.blandet ? 'bekreftet' : 'sjekk';
    grunn.mva = sats ? `Passer med ${sats} % av totalen.` : 'Passer med totalen (flere satser).';
  } else if (mvaVerdier.length) {
    // Det står en MVA-linje, men den passer ikke med totalen. Vis tallet, men be om kontroll.
    mva = mvaVerdier[mvaVerdier.length - 1].ore; status.mva = 'sjekk';
    grunn.mva = total != null ? `MVA ${kr(mva)} kr passer ikke med ${kr(total)} kr. Sjekk begge tallene.` : 'Sjekk MVA-beløpet.';
  } else if (mvaLinjeFinnes) { status.mva = 'sjekk'; grunn.mva = 'Det står MVA på kvitteringen, men beløpet kunne ikke leses sikkert. Fyll inn selv.'; }
  else { status.mva = 'mangler'; grunn.mva = 'Fant ikke MVA på kvitteringen.'; }
  if (sats == null && mva != null && total) {
    const s = SATSER.find(x => naer(mva, mvaFor(total, x), 2));
    if (s) sats = s;
  }

  // Dato: helst en linje som sier «dato», ellers første gyldige dato.
  const idag = opts.idag || new Date().toISOString().slice(0, 10);
  let dato = null;
  const datoer = [];
  alle.forEach(x => { for (const m of x.raa.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/g)) { const iso = tilIso(m[1], m[2], m[3]); if (iso) datoer.push({ iso, merket: /dato|date/i.test(x.raa) }); } });
  const plausibel = d => d <= idag && d >= `${Number(idag.slice(0, 4)) - 2}${idag.slice(4)}`;
  const valgt = datoer.find(d => d.merket && plausibel(d.iso)) || datoer.find(d => plausibel(d.iso));
  if (valgt) { dato = valgt.iso; status.dato = 'lest'; }
  else if (datoer.length) { dato = datoer[0].iso; status.dato = 'sjekk'; grunn.dato = 'Datoen ser feil ut (i fremtiden eller over to år gammel). Sjekk den.'; }
  else { status.dato = 'mangler'; grunn.dato = 'Fant ikke datoen.'; }

  // Leverandør og org.nr.
  let orgnr = null;
  for (const x of alle) { const m = x.raa.replace(/\s/g, '').match(/(?:org\.?(?:nr|no)?\.?|NO)?:?(\d{9})(?:MVA)?/i); if (m && gyldigOrgnr(m[1])) { orgnr = m[1]; break; } }
  const topp = linjer.slice(0, 8);
  const lev = topp.find(l => /\b(AS|ASA|ANS|DA|ENK|SA|NUF)\b/.test(l) && !/kunde|kjøper|til:/i.test(l)) || topp.find(l => /[A-Za-zÆØÅæøå]{3}/.test(l) && !/kvittering|velkommen|salgskvittering/i.test(l)) || null;
  status.lev = lev ? (orgnr ? 'bekreftet' : 'lest') : 'mangler';
  if (orgnr) grunn.lev = `Org.nr ${orgnr.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')} er gyldig.`;

  return {
    lev: lev ? lev.replace(/\s{2,}/g, ' ').slice(0, 80) : null, orgnr, dato, total, mva, sats,
    varer: varer.map(v => ({ tekst: v.tekst, ore: v.ore })),
    beskrivelse: varer.slice(0, 3).map(v => v.tekst).join(', ').slice(0, 80) || null,
    status, grunn,
    /** true når totalen og MVA er kryss-sjekket. Brukeren skal likevel alltid bekrefte. */
    sikker: status.total === 'bekreftet' && (status.mva === 'bekreftet' || status.mva === 'mangler'),
  };
}

function kr(ore) {
  const a = Math.abs(ore), h = Math.floor(a / 100), d = a % 100;
  return `${ore < 0 ? '−' : ''}${String(h).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${String(d).padStart(2, '0')}`;
}

/** Beløpet i ord, for å gjøre tapte og ekstra nuller lette å se: 180000 øre → «ett tusen åtte hundre kroner». */
export function kronerIOrd(ore) {
  const n = Math.floor(Math.abs(ore) / 100);
  const en = ['null', 'en', 'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'åtte', 'ni', 'ti', 'elleve', 'tolv', 'tretten', 'fjorten', 'femten', 'seksten', 'sytten', 'atten', 'nitten'];
  const ti = ['', '', 'tjue', 'tretti', 'førti', 'femti', 'seksti', 'sytti', 'åtti', 'nitti'];
  const under100 = x => (x < 20 ? en[x] : ti[Math.floor(x / 10)] + (x % 10 ? en[x % 10] : ''));
  const under1000 = x => { const h = Math.floor(x / 100), r = x % 100; return [h ? (h === 1 ? 'ett hundre' : en[h] + ' hundre') : '', r ? (h ? 'og ' : '') + under100(r) : ''].filter(Boolean).join(' '); };
  if (n === 0) return 'null kroner';
  const mill = Math.floor(n / 1e6), tus = Math.floor((n % 1e6) / 1000), rest = n % 1000;
  const deler = [];
  if (mill) deler.push(mill === 1 ? 'én million' : under1000(mill) + ' millioner');
  if (tus) deler.push(tus === 1 ? 'ett tusen' : under1000(tus) + ' tusen');
  if (rest) deler.push((mill || tus) && rest < 100 ? 'og ' + under100(rest) : under1000(rest));
  return deler.join(' ') + (n === 1 ? ' krone' : ' kroner');
}

/**
 * Tolker flere lesinger av samme kvittering (for eksempel vanlig og svart-hvitt) og velger den beste.
 * Er to lesinger begge sikre, men uenige om beløpet, er ingen av dem sikre.
 * @param {string[]} tekster
 * @param {{ idag?: string }} [opts]
 */
export function tolkBeste(tekster, opts = {}) {
  const r = tekster.filter(t => t && t.trim()).map(t => tolkKvittering(t, opts));
  if (!r.length) return tolkKvittering('', opts);
  const poeng = x => (x.sikker ? 100 : 0) + Object.values(x.status).filter(v => v === 'bekreftet').length * 10 + (x.total != null ? 5 : 0) + (x.mva != null ? 2 : 0) + (x.dato ? 1 : 0);
  const sortert = [...r].sort((a, b) => poeng(b) - poeng(a));
  const best = sortert[0];
  const uenig = r.find(x => x !== best && x.total != null && best.total != null && x.total !== best.total && (x.sikker || x.status.total === 'bekreftet'));
  if (uenig) {
    return { ...best, sikker: false, status: { ...best.status, total: 'sjekk' }, grunn: { ...best.grunn, total: `Kvitteringen ble lest to ganger med ulikt resultat (${kr(best.total)} og ${kr(uenig.total)} kr). Sjekk beløpet.` } };
  }
  // Fyll inn felt den beste lesingen mangler fra de andre.
  for (const x of sortert.slice(1)) {
    if (!best.dato && x.dato) { best.dato = x.dato; best.status.dato = x.status.dato; }
    if (!best.lev && x.lev) { best.lev = x.lev; best.status.lev = x.status.lev; }
    if (!best.orgnr && x.orgnr) best.orgnr = x.orgnr;
    if (!best.beskrivelse && x.beskrivelse) best.beskrivelse = x.beskrivelse;
  }
  return best;
}
