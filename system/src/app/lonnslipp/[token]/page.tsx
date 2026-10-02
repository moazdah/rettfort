import { Logo } from '@/components/Logo';
import { db } from '@/lib/server';
import { lonnslippInfo } from '@/lib/tjenester/lonnslipp';
import { ApneLonnslipp } from './apne';

export const metadata = { title: 'Lønnslipp', robots: { index: false } };

export default async function Lonnslipp({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await lonnslippInfo(await db(), token);
  return (
    <main className="midt">
      <div className="boks" style={{ maxWidth: 520 }}>
        <div style={{ marginBottom: 28 }}><Logo bredde={120} /></div>
        {info ? <ApneLonnslipp token={token} {...info} /> : (
          <><h1>Lenken virker ikke</h1><p className="mut" style={{ marginTop: 8 }}>Lenken er feil eller utløpt. Be arbeidsgiveren din sende lønnslippen på nytt.</p></>
        )}
      </div>
    </main>
  );
}
