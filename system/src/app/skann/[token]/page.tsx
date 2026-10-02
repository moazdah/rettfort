import type { Metadata, Viewport } from 'next';
import { Logo } from '@/components/Logo';
import { db } from '@/lib/server';
import { hentLenke, mineUtlegg } from '@/lib/tjenester/innsending';
import { SkannSide } from './side';

export const metadata: Metadata = { title: 'Send kvittering', robots: { index: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, themeColor: '#0B2545' };

export default async function Skann({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await db();
  const l = await hentLenke(d, token);
  if (!l) return (
    <main className="midt"><div className="boks">
      <div style={{ marginBottom: 24 }}><Logo bredde={120} /></div>
      <h1>Lenken virker ikke</h1>
      <p className="mut" style={{ marginTop: 8 }}>Lenken er slettet eller utløpt. QR-koder fra PC-en virker i 15 minutter. Be om en ny lenke.</p>
    </div></main>
  );
  const utlegg = l.type === 'ansatt' && l.ansatt_id ? await mineUtlegg(d, l.id, l.ansatt_id) : [];
  return <SkannSide token={token} type={l.type} foretak={l.foretak} navn={l.type === 'ansatt' ? l.ansatt_navn : l.navn} utlegg={utlegg} />;
}
