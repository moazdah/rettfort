'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { graatone, finnDokument, Autoutlos, HINTTEKST, skarphet, malStorrelse, rettOpp, forbedre, type Firkant, type Hint } from '@/lib/skanner';

const ANALYSE_BREDDE = 240;
const MIN_SKARPHET = 25;

/** Gjør et bilde om til JPEG, maks 2000 px på lengste side, og under ca. 1,5 MB. */
async function tilJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const q of [0.85, 0.75, 0.6]) {
    const b = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', q));
    if (b && (b.size < 1_500_000 || q === 0.6)) return b;
  }
  throw new Error('Kunne ikke lagre bildet.');
}

async function filTilSide(f: File): Promise<Blob> {
  if (f.type === 'application/pdf') return f;
  const bm = await createImageBitmap(f);
  const s = Math.min(1, 2000 / Math.max(bm.width, bm.height));
  const c = document.createElement('canvas'); c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
  c.getContext('2d')!.drawImage(bm, 0, 0, c.width, c.height);
  return tilJpeg(c);
}

/**
 * Kamera som finner kvitteringen selv. Viser en ramme rundt den, sier «gå nærmere», «hold stille» osv.,
 * og tar bildet automatisk når det er skarpt og i ro. Bildet rettes opp og gjøres hvitt, som en skanner.
 * Flere sider kan legges til. `onFerdig` får sidene som JPEG (eller PDF fra «Velg fra bilder»).
 */
export function Skanner({ onFerdig, knappTekst = 'Send', opptatt = false }: { onFerdig: (sider: Blob[]) => void; knappTekst?: string; opptatt?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const tegn = useRef<HTMLCanvasElement>(null);
  const analyse = useRef<HTMLCanvasElement | null>(null);
  const strom = useRef<MediaStream | null>(null);
  const utlos = useRef(new Autoutlos(6));
  const firkant = useRef<{ f: Firkant; aw: number; ah: number } | null>(null);
  const tar = useRef(false);
  const filRef = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<'kamera' | 'se' | 'sider' | 'feil'>('kamera');
  const [hint, setHint] = useState<Hint>('finner');
  const [blink, setBlink] = useState(false);
  const [forslag, setForslag] = useState<{ blob: Blob; url: string } | null>(null);
  const [sider, setSider] = useState<{ blob: Blob; url: string }[]>([]);
  const [kameraFeil, setKameraFeil] = useState('');
  const [retter, setRetter] = useState(false);

  const stopp = useCallback(() => { strom.current?.getTracks().forEach(t => t.stop()); strom.current = null; }, []);

  // Kobler kameraet til videoen. Videoen finnes bare mens kameraet vises, så dette kjøres også når fasen endres.
  const koble = useCallback(() => {
    const v = video.current, s = strom.current;
    if (v && s && v.srcObject !== s) { v.srcObject = s; v.play().catch(() => {}); }
  }, []);

  const start = useCallback(async () => {
    setKameraFeil(''); utlos.current.nullstill(); tar.current = false;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      strom.current = s;
      setFase('kamera');
      koble();
    } catch {
      setKameraFeil('Fikk ikke tilgang til kameraet. Tillat kamera i nettleseren, eller velg et bilde du allerede har tatt.');
      setFase('feil');
    }
  }, []);

  useEffect(() => { start(); return stopp; }, [start, stopp]);
  useEffect(() => { if (fase === 'kamera' || fase === 'se') koble(); }, [fase, koble]);

  const ta = useCallback(async (medRamme: boolean) => {
    const v = video.current;
    if (!v || !v.videoWidth || tar.current) return;
    tar.current = true;
    setBlink(true); setTimeout(() => setBlink(false), 180);
    navigator.vibrate?.(40);
    setRetter(true);
    // La blinket vises før den tunge utregningen starter.
    await new Promise(r => setTimeout(r, 30));
    const vw = v.videoWidth, vh = v.videoHeight;
    const hel = document.createElement('canvas'); hel.width = vw; hel.height = vh;
    const hx = hel.getContext('2d', { willReadFrequently: true })!;
    hx.drawImage(v, 0, 0, vw, vh);
    const ut = document.createElement('canvas');
    const fk = firkant.current;
    if (medRamme && fk) {
      const k = vw / fk.aw;
      // Litt luft rundt kantene så ingenting av kvitteringen kuttes.
      const mx = fk.f.reduce((a, p) => a + p.x, 0) / 4, my = fk.f.reduce((a, p) => a + p.y, 0) / 4;
      const q = fk.f.map(p => ({ x: Math.max(0, Math.min(vw - 1, (mx + (p.x - mx) * 1.008) * k)), y: Math.max(0, Math.min(vh - 1, (my + (p.y - my) * 1.008) * k)) })) as Firkant;
      const m = malStorrelse(q, 2000);
      const px = rettOpp(hx.getImageData(0, 0, vw, vh).data, vw, vh, q, m.w, m.h);
      forbedre(px);
      ut.width = m.w; ut.height = m.h;
      ut.getContext('2d')!.putImageData(new ImageData(px as unknown as Uint8ClampedArray<ArrayBuffer>, m.w, m.h), 0, 0);
    } else {
      const s = Math.min(1, 2000 / Math.max(vw, vh));
      ut.width = Math.round(vw * s); ut.height = Math.round(vh * s);
      ut.getContext('2d')!.drawImage(hel, 0, 0, ut.width, ut.height);
    }
    const blob = await tilJpeg(ut);
    setRetter(false);
    setForslag({ blob, url: URL.createObjectURL(blob) });
    setFase('se');
  }, []);

  // Analyse: ca. 10 ganger i sekundet på et lite bilde.
  useEffect(() => {
    if (fase !== 'kamera') return;
    let timer = 0, aktiv = true;
    const steg = () => {
      if (!aktiv) return;
      const v = video.current, c = tegn.current;
      if (v && c && v.videoWidth && !tar.current) {
        const aw = ANALYSE_BREDDE, ah = Math.round((v.videoHeight / v.videoWidth) * aw);
        if (!analyse.current) analyse.current = document.createElement('canvas');
        const a = analyse.current; a.width = aw; a.height = ah;
        const ax = a.getContext('2d', { willReadFrequently: true })!;
        ax.drawImage(v, 0, 0, aw, ah);
        const g = graatone(ax.getImageData(0, 0, aw, ah).data, aw, ah);
        const funn = finnDokument(g, aw, ah);
        let h = utlos.current.mal(funn, aw);
        if (h === 'klar' && skarphet(g, aw, ah) < MIN_SKARPHET) { h = 'stille'; utlos.current.nullstill(); }
        firkant.current = funn.firkant && funn.fylling > 0.7 ? { f: funn.firkant, aw, ah } : null;
        setHint(h);
        // Tegn rammen over videoen (videoen fyller skjermen, så vi regner om som «cover»).
        const cw = c.clientWidth, ch = c.clientHeight;
        if (c.width !== cw) c.width = cw;
        if (c.height !== ch) c.height = ch;
        const cx = c.getContext('2d')!;
        cx.clearRect(0, 0, cw, ch);
        if (firkant.current) {
          const s = Math.max(cw / aw, ch / ah), ox = (cw - aw * s) / 2, oy = (ch - ah * s) / 2;
          cx.beginPath();
          firkant.current.f.forEach((p, i) => (i ? cx.lineTo : cx.moveTo).call(cx, ox + p.x * s, oy + p.y * s));
          cx.closePath();
          const bra = h === 'stille' || h === 'klar';
          cx.fillStyle = bra ? 'rgba(54,174,116,0.18)' : 'rgba(246,223,110,0.14)';
          cx.strokeStyle = bra ? '#36AE74' : '#F6DF6E';
          cx.lineWidth = 4; cx.lineJoin = 'round';
          cx.fill(); cx.stroke();
        }
        if (h === 'klar') { ta(true); return; }
      }
      timer = window.setTimeout(steg, 100);
    };
    steg();
    return () => { aktiv = false; clearTimeout(timer); };
  }, [fase, ta]);

  const bruk = () => {
    if (!forslag) return;
    setSider(s => [...s, forslag]); setForslag(null); setFase('sider'); stopp();
  };
  const igjen = () => { if (forslag) URL.revokeObjectURL(forslag.url); setForslag(null); tar.current = false; utlos.current.nullstill(); if (strom.current) setFase('kamera'); else start(); };
  const nySide = () => { tar.current = false; start(); };
  const velgFil = async (f: File) => {
    const b = await filTilSide(f);
    setSider(s => [...s, { blob: b, url: URL.createObjectURL(b) }]); setFase('sider'); stopp();
  };
  const fjern = (i: number) => setSider(s => { URL.revokeObjectURL(s[i].url); const n = s.filter((_, j) => j !== i); if (!n.length) nySide(); return n; });

  const filfelt = <input ref={filRef} type="file" accept="image/*,application/pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) velgFil(f); e.target.value = ''; }} />;

  if (fase === 'sider' || fase === 'feil') return (
    <div className="stakk skann-sider">
      {filfelt}
      {fase === 'feil' && <div className="varsel gul">{kameraFeil}</div>}
      {sider.length > 0 && (
        <>
          <div className="skann-miniatyrer">
            {sider.map((s, i) => (
              <div key={s.url} className="skann-miniatyr">
                {s.blob.type === 'application/pdf' ? <div className="skann-pdf">PDF</div> : <img src={s.url} alt={`Side ${i + 1}`} />}
                <span>Side {i + 1}</span>
                <button type="button" onClick={() => fjern(i)} aria-label={`Fjern side ${i + 1}`}>×</button>
              </div>
            ))}
          </div>
          <button type="button" className="knapp stor" disabled={opptatt} onClick={() => onFerdig(sider.map(s => s.blob))}>{opptatt ? 'Sender …' : knappTekst}</button>
        </>
      )}
      <div className="rad" style={{ gap: 8, justifyContent: 'center' }}>
        <button type="button" className="knapp hvit" onClick={nySide}>{sider.length ? '+ Legg til side' : 'Prøv kameraet igjen'}</button>
        <button type="button" className="knapp hvit" onClick={() => filRef.current?.click()}>Velg fra bilder</button>
      </div>
    </div>
  );

  return (
    <div className="skanner">
      {filfelt}
      <video ref={video} playsInline muted autoPlay className="skanner-video" />
      <canvas ref={tegn} className="skanner-ramme" />
      {blink && <div className="skanner-blink" />}
      {fase === 'se' && forslag && (
        <div className="skanner-se">
          <img src={forslag.url} alt="Bildet som ble tatt" />
          <div className="skanner-knapper">
            <button type="button" className="knapp hvit" onClick={igjen}>Ta på nytt</button>
            <button type="button" className="knapp" onClick={bruk}>Bruk bildet</button>
          </div>
        </div>
      )}
      {fase === 'kamera' && (
        <div className="skanner-bunn">
          <div className={`skanner-hint ${hint === 'stille' || hint === 'klar' ? 'bra' : ''}`} aria-live="polite">{retter ? 'Retter opp bildet …' : HINTTEKST[hint]}</div>
          <div className="skanner-knapper">
            <button type="button" className="skanner-sekundar" onClick={() => filRef.current?.click()}>Velg fra bilder</button>
            <button type="button" className="skanner-utloser" aria-label="Ta bilde" onClick={() => ta(!!firkant.current)} />
            <span className="skanner-sekundar" style={{ visibility: sider.length ? 'visible' : 'hidden' }} onClick={() => { stopp(); setFase('sider'); }}>{sider.length} {sider.length === 1 ? 'side' : 'sider'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
