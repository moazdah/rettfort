/* eslint-disable @next/next/no-img-element */
export function Logo({ bredde = 104 }: { bredde?: number }) {
  // Logoen er et bilde med luft rundt; beskjæres som på rettført.no.
  const h = Math.round(bredde * 0.25);
  return (
    <span style={{ display: 'inline-block', width: bredde, height: h, overflow: 'hidden', position: 'relative' }}>
      <img src="/rettfort-logo.png" alt="Rettført" style={{ position: 'absolute', maxWidth: 'none', left: -bredde * 0.1417, top: -bredde * 0.0806, width: bredde * 1.272, height: bredde * 0.4243 }} />
    </span>
  );
}

export function Maskot({ storrelse = 96 }: { storrelse?: number }) {
  return <img src="/mascot-hip.png" alt="" width={storrelse} height={storrelse} style={{ width: storrelse, height: 'auto' }} />;
}
