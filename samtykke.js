// Samtykke til informasjonskapsler: en liten boks nederst med «Avslå» og «Godta», like store.
// Valget lagres i kaken rf_samtykke i et halvt år og deles med min.rettført.no.
// Google Analytics lastes bare etter «Godta». Annet som krever samtykke: rettfortSamtykke.narGodtatt(() => { ... }).
// Lenker med data-samtykke åpner boksen igjen, så valget kan endres.
(function () {
  'use strict';
  var NAVN = 'rf_samtykke', DAGER = 182, GA = 'G-2L7ELX5H3C';
  var ventende = [];

  function rotDomene() {
    var rot = location.hostname.match(/(?:^|\.)(xn--rettfrt-u1a\.no|rettført\.no)$/);
    return rot ? rot[1] : '';
  }

  function lastGA() {
    if (window.__rfGA) return;
    window.__rfGA = true;
    window['ga-disable-' + GA] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA);
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA;
    document.head.appendChild(s);
  }

  /** Ved «Avslå» etter et tidligere «Godta»: stopp målingen og fjern kakene til Google Analytics. */
  function stoppGA() {
    window['ga-disable-' + GA] = true;
    var d = rotDomene();
    document.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (n !== '_ga' && n.indexOf('_ga_') !== 0) return;
      ['', '; domain=' + location.hostname, d ? '; domain=.' + d : ''].forEach(function (dom) {
        document.cookie = n + '=; path=/; max-age=0' + dom;
      });
    });
  }

  function les() {
    var m = document.cookie.match(/(?:^|;\s*)rf_samtykke=(ja|nei)/);
    if (m) return m[1];
    try { var v = localStorage.getItem(NAVN); return v === 'ja' || v === 'nei' ? v : null; } catch (e) { return null; }
  }

  function lagre(v) {
    var d = rotDomene(), domene = d ? '; domain=.' + d : '';
    document.cookie = NAVN + '=' + v + '; path=/; max-age=' + DAGER * 86400 + '; samesite=lax' + (location.protocol === 'https:' ? '; secure' : '') + domene;
    try { localStorage.setItem(NAVN, v); } catch (e) {}
  }

  function kjor() {
    if (les() !== 'ja') return;
    while (ventende.length) { try { ventende.shift()(); } catch (e) {} }
  }

  var stil = '\
.rf-samtykke{position:fixed;left:16px;bottom:16px;z-index:9999;width:min(380px,calc(100vw - 32px));box-sizing:border-box;\
background:#fff;color:#0B2545;border:1px solid #E4DFD4;border-radius:16px;padding:18px 18px 16px;\
box-shadow:0 12px 32px rgba(11,37,69,.14),0 2px 6px rgba(11,37,69,.06);font:15px/1.5 "Schibsted Grotesk",system-ui,-apple-system,"Segoe UI",sans-serif;\
opacity:0;transform:translateY(8px);transition:opacity .2s ease,transform .2s ease}\
.rf-samtykke.vis{opacity:1;transform:none}\
.rf-samtykke p{margin:0 0 14px}\
.rf-samtykke a{color:#0B2545;text-decoration:underline;text-underline-offset:2px}\
.rf-samtykke .rf-knapper{display:flex;gap:8px}\
.rf-samtykke button{flex:1;min-height:44px;border-radius:99px;font-family:inherit;font-size:15px;font-weight:600;line-height:1;cursor:pointer;border:1px solid #0B2545}\
.rf-samtykke .rf-nei{background:#fff;color:#0B2545}\
.rf-samtykke .rf-ja{background:#0B2545;color:#fff}\
.rf-samtykke button:focus-visible{outline:3px solid #F6DF6E;outline-offset:2px}\
@media (max-width:480px){.rf-samtykke{left:12px;right:12px;bottom:12px;width:auto}}\
@media (prefers-reduced-motion:reduce){.rf-samtykke{transition:none}}';

  var boks = null;

  function lukk() {
    if (!boks) return;
    var b = boks; boks = null;
    b.classList.remove('vis');
    setTimeout(function () { b.remove(); }, 200);
  }

  function vis() {
    if (boks) return;
    if (!document.getElementById('rf-samtykke-stil')) {
      var s = document.createElement('style'); s.id = 'rf-samtykke-stil'; s.textContent = stil; document.head.appendChild(s);
    }
    boks = document.createElement('div');
    boks.className = 'rf-samtykke';
    boks.setAttribute('role', 'region');
    boks.setAttribute('aria-label', 'Informasjonskapsler');
    boks.innerHTML = '<p>Vi vil gjerne bruke informasjonskapsler for å se hvordan nettsiden brukes, så vi kan gjøre den bedre. <a href="/personvern#cookies">Les mer</a></p>'
      + '<div class="rf-knapper"><button type="button" class="rf-nei">Avslå</button><button type="button" class="rf-ja">Godta</button></div>';
    boks.querySelector('.rf-nei').onclick = function () { lagre('nei'); lukk(); stoppGA(); };
    boks.querySelector('.rf-ja').onclick = function () { lagre('ja'); lukk(); kjor(); };
    document.body.appendChild(boks);
    requestAnimationFrame(function () { requestAnimationFrame(function () { boks && boks.classList.add('vis'); }); });
  }

  window.rettfortSamtykke = {
    verdi: les,
    vis: vis,
    narGodtatt: function (fn) { ventende.push(fn); kjor(); }
  };

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-samtykke]');
    if (a) { e.preventDefault(); vis(); return; }
    malKlikk(e.target.closest && e.target.closest('a[href]'));
  });

  /** De viktigste trykkene, så du ser hvor mange som går videre: Start gratis, Velg pakke og Logg inn. */
  function malKlikk(a) {
    if (!a || !window.gtag || les() !== 'ja') return;
    var h = a.getAttribute('href') || '';
    var pakke = h.match(/\/pakke\/(gratis|start|selskap)/);
    if (pakke) window.gtag('event', 'generate_lead', { pakke: pakke[1], knapp: (a.textContent || '').trim().slice(0, 40) });
    else if (/\/registrer/.test(h)) window.gtag('event', 'generate_lead', { pakke: 'gratis', knapp: (a.textContent || '').trim().slice(0, 40) });
    else if (/\/logg-inn/.test(h)) window.gtag('event', 'logg_inn_klikk');
  }

  ventende.push(lastGA);

  function start() { if (!les()) vis(); else kjor(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
