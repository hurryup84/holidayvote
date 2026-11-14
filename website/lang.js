/*
  Sprache der Seite (Deutsch / Englisch) – gleiche Datei auf allen moidev-Websites.
  Texte stehen doppelt im HTML, mit lang="de" bzw. lang="en"; site.css blendet die andere Sprache aus,
  sobald dieses Skript html[data-lang] gesetzt hat. Ohne JavaScript bleiben beide Sprachen sichtbar.
  Reihenfolge: ?lang=de|en in der Adresse (Store-Links) → #en / #de (ältere Links) →
  zuletzt per Umschalter gewählte Sprache → Browsersprache (Deutsch, wenn bevorzugt, sonst Englisch).
  Umschalter: <a href="?lang=en" data-switch="en" lang="de">English</a> / <a href="?lang=de" data-switch="de" lang="en">Deutsch</a>
*/
(function () {
  var root = document.documentElement;
  function ok(l) { return l === 'de' || l === 'en'; }
  function apply(l) { root.setAttribute('data-lang', l); root.lang = l; }

  var lang = null;
  try { lang = new URLSearchParams(location.search).get('lang'); } catch (e) {}
  if (!ok(lang) && (location.hash === '#en' || location.hash === '#de')) {
    lang = location.hash.slice(1);
    // Anker entfernen, sonst springt der Browser mitten in die Seite (zum früheren englischen Abschnitt).
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }
  if (!ok(lang)) { try { lang = localStorage.getItem('lang'); } catch (e) {} }
  if (!ok(lang)) {
    var prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    lang = 'en';
    for (var i = 0; i < prefs.length; i++) {
      var p = String(prefs[i]).toLowerCase();
      if (p.indexOf('de') === 0) { lang = 'de'; break; }
      if (p.indexOf('en') === 0) break;
    }
  }
  apply(lang);

  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('[data-switch]');
    if (!link) return;
    event.preventDefault();
    var next = link.getAttribute('data-switch');
    apply(next);
    try { localStorage.setItem('lang', next); } catch (e) {}
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
  });
})();
