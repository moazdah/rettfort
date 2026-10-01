import { NextResponse, type NextRequest } from 'next/server';
import { OKT_COOKIE, egenVaktplanAdresse, erMinVert, erVaktplanVert, minAdresse, oktDomene, vaktplanAdresse, vertAv } from '@/lib/verter';

// Vaktplanen har egen adresse: vaktplan.rettført.no. Regnskapet er på min.rettført.no.
// Det er det samme systemet; her bestemmes bare hva som vises på hvilken adresse.

/** Det som hører hjemme på vaktplan-adressen. Alt annet sendes til min.rettført.no. */
const PA_VAKTPLAN = /^\/(vp|vakt|logg-inn|glemt-passord|tilbakestill|api)(\/|$)/;
/** Det som flyttes fra min.rettført.no til vaktplan-adressen. */
const TIL_VAKTPLAN = /^\/(vaktplan|vakt|vp)(\/|$)/;

export function proxy(req: NextRequest) {
  const vert = vertAv(req.headers);
  const { pathname, search } = req.nextUrl;
  const les = req.method === 'GET' || req.method === 'HEAD';

  if (erVaktplanVert(vert)) {
    // Forsiden på vaktplan-adressen er lederens vaktplan (ansatte sendes videre til /vakt derfra).
    if (pathname === '/' || pathname === '/vaktplan') return NextResponse.rewrite(new URL(`/vp${search}`, req.url));
    if (pathname === '/hjem') return NextResponse.redirect(new URL(`/${search}`, req.url));
    if (PA_VAKTPLAN.test(pathname) || pathname.startsWith('/_next') || /\.\w+$/.test(pathname) || !les) return NextResponse.next();
    return NextResponse.redirect(`${minAdresse()}${pathname}${search}`);
  }

  if (egenVaktplanAdresse() && erMinVert(vert) && les && TIL_VAKTPLAN.test(pathname)) {
    const sti = pathname === '/vaktplan' || pathname === '/vp' ? '/' : pathname.replace(/^\/vp\//, '/vaktplan/');
    const res = NextResponse.redirect(`${vaktplanAdresse()}${sti}${search}`);
    // Innlogginger fra før vaktplanen fikk egen adresse gjaldt bare min. Flytt dem til den delte kaken.
    const gammel = req.cookies.get('rf_sesjon')?.value;
    if (gammel && !req.cookies.get(OKT_COOKIE)) {
      const domain = oktDomene(vert);
      res.cookies.set(OKT_COOKIE, gammel, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 30 * 86400, ...(domain ? { domain } : {}) });
      res.cookies.delete('rf_sesjon');
    }
    return res;
  }

  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
