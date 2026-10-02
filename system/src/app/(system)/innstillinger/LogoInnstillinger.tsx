'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { lastOppLogo, velgLogoStederHandling, fjernLogoHandling } from '@/app/handlinger';
import { LOGO_STEDER, MAKS_BREDDE, MAKS_HOYDE, MAKS_BYTES } from '@/lib/logo';

/** Gjør bildet mindre i nettleseren og lager PNG (beholder gjennomsiktig bakgrunn) eller JPG om PNG blir for stor. */
async function forbered(fil: File): Promise<{ dataUrl: string; bredde: number; hoyde: number }> {
  if (!/^image\/(png|jpeg|webp)$/.test(fil.type)) throw new Error('Velg et bilde i PNG, JPG eller WebP.');
  if (fil.size > 10 * 1024 * 1024) throw new Error('Bildet er større enn 10 MB. Velg et mindre bilde.');
  const url = URL.createObjectURL(fil);
  try {
    const img = await new Promise<HTMLImageElement>((ok, feil) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => feil(new Error('Bildet kunne ikke leses.')); i.src = url; });
    const s = Math.min(1, MAKS_BREDDE / img.naturalWidth, MAKS_HOYDE / img.naturalHeight);
    const bredde = Math.max(1, Math.round(img.naturalWidth * s)), hoyde = Math.max(1, Math.round(img.naturalHeight * s));
    const c = document.createElement('canvas'); c.width = bredde; c.height = hoyde;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, bredde, hoyde);
    let dataUrl = c.toDataURL('image/png');
    if (dataUrl.length * 0.75 > MAKS_BYTES) {
      const h = document.createElement('canvas'); h.width = bredde; h.height = hoyde;
      const hg = h.getContext('2d')!; hg.fillStyle = '#fff'; hg.fillRect(0, 0, bredde, hoyde); hg.drawImage(c, 0, 0);
      dataUrl = h.toDataURL('image/jpeg', 0.88);
    }
    if (dataUrl.length * 0.75 > MAKS_BYTES) throw new Error('Bildet er for detaljert. Prøv en enklere versjon av logoen.');
    return { dataUrl, bredde, hoyde };
  } finally { URL.revokeObjectURL(url); }
}

export function LogoInnstillinger({ logo, bruk }: { logo: string | null; bruk: string[] }) {
  const router = useRouter();
  const fil = useRef<HTMLInputElement>(null);
  const [valgt, setValgt] = useState<string[]>(bruk);
  const [svar, setSvar] = useState<{ ok: boolean; t: string } | null>(null);
  const [venter, setVenter] = useState(false);

  const last = async (f: File | undefined) => {
    if (!f) return;
    setVenter(true); setSvar(null);
    try {
      const b = await forbered(f);
      const r = await lastOppLogo(b.dataUrl, b.bredde, b.hoyde);
      setSvar(r.ok ? { ok: true, t: logo ? 'Logoen er byttet.' : 'Logoen er lagret. Velg under hvor den skal vises.' } : { ok: false, t: r.feil });
      if (r.ok) { if (!logo) setValgt(LOGO_STEDER.map(s => s[0])); router.refresh(); }
    } catch (e) { setSvar({ ok: false, t: e instanceof Error ? e.message : 'Bildet kunne ikke lastes opp.' }); }
    setVenter(false);
    if (fil.current) fil.current.value = '';
  };

  const bytt = async (sted: string, pa: boolean) => {
    const nye = pa ? [...valgt, sted] : valgt.filter(s => s !== sted);
    setValgt(nye); setSvar(null);
    const r = await velgLogoStederHandling(nye);
    if (!r.ok) { setValgt(valgt); setSvar({ ok: false, t: r.feil }); } else router.refresh();
  };

  const fjern = async () => {
    setVenter(true); setSvar(null);
    const r = await fjernLogoHandling();
    setVenter(false);
    setSvar(r.ok ? { ok: true, t: 'Logoen er fjernet.' } : { ok: false, t: r.feil });
    if (r.ok) router.refresh();
  };

  return (
    <div className="stakk">
      <div className="logo-flate">{logo ? <img src={logo} alt="Logoen til foretaket" /> : <span className="mut liten">Ingen logo ennå</span>}</div>
      <input ref={fil} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => last(e.target.files?.[0])} />
      <div className="rad" style={{ gap: 8 }}>
        <button type="button" className="knapp" disabled={venter} onClick={() => fil.current?.click()}>{venter ? 'Laster opp …' : logo ? 'Bytt logo' : 'Last opp logo'}</button>
        {logo && <button type="button" className="knapp hvit" disabled={venter} onClick={fjern}>Fjern</button>}
      </div>
      <p className="hint">PNG, JPG eller WebP. Gjennomsiktig bakgrunn blir finest. Bildet gjøres mindre før det lagres.</p>
      {svar && <div className={`varsel ${svar.ok ? 'gronn' : 'rod'}`} role="status">{svar.t}</div>}
      {logo && (
        <fieldset className="stakk" style={{ gap: 0, border: 0, padding: 0, margin: 0 }}>
          <legend className="mut liten" style={{ marginBottom: 6 }}>Hvor skal logoen vises?</legend>
          {LOGO_STEDER.map(([k, t, hint]) => (
            <label key={k} className="logo-valg">
              <input type="checkbox" checked={valgt.includes(k)} onChange={e => bytt(k, e.target.checked)} />
              <span className="fyll"><b style={{ fontWeight: 600 }}>{t}</b><span className="hint" style={{ display: 'block' }}>{hint}</span></span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
