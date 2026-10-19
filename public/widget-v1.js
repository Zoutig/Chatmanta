/* ChatManta V1 embeddable widget loader. Gebruik:
   <script src="https://<host>/widget-v1.js" data-org="acme-corp" defer></script>
   Port van public/widget.js; enig verschil: iframe.src wijst naar /embed-v1/.
   Contract (blijft gelijk): data-org (of data-chatbot), iframe /embed-v1/<slug>?h=<host>[&m=1],
   postMessage-types chatmanta:ready / chatmanta:resize / chatmanta:host.
   Bewust ES5 (geen let/const/arrow): draait op oude browsers en door CMS-optimizers heen. */
(function () {
  var PREFIX = '[chatmanta] widget-v1.js: ';
  if (window.__chatmantaWidgetV1Loaded) return;

  // currentScript is null bij sommige optimizers/injectors (en altijd in een
  // callback). Val terug op de eerste script-tag die naar deze loader wijst.
  var script = document.currentScript;
  if (!script || !/\/widget-v1\.js(\?|#|$)/.test(script.src || '')) {
    script =
      document.querySelector('script[src*="/widget-v1.js"][data-org]') ||
      document.querySelector('script[src*="/widget-v1.js"][data-chatbot]');
  }
  if (!script) {
    console.warn(
      PREFIX +
        'kon de eigen <script>-tag niet vinden (document.currentScript is leeg). ' +
        'Plaats de code letterlijk als <script src=".../widget-v1.js" data-org="..." defer></script>, ' +
        'niet via een optimizer die scripts samenvoegt of herschrijft. Niets geladen.'
    );
    return;
  }
  var org = script.getAttribute('data-org') || script.getAttribute('data-chatbot');
  if (!org) {
    console.warn(PREFIX + 'ontbrekend data-org attribuut — niets geladen. Kopieer de code opnieuw uit je ChatManta-dashboard.');
    return;
  }

  // App-origin = waar widget-v1.js vandaan komt. Werkt op localhost en prod.
  var origin;
  try {
    origin = new URL(script.src, window.location.href).origin;
  } catch (e) {
    console.warn(PREFIX + 'ongeldige src "' + script.src + '" — niets geladen.');
    return;
  }

  // Pas nu alle checks geslaagd zijn: markeer als geladen (een tweede tag laadt niets).
  window.__chatmantaWidgetV1Loaded = true;

  // apex ↔ www van de EIGEN widget-origin: code met https://chatmanta.nl wordt door een
  // 307 naar www gestuurd, waarna de iframe-berichten van www komen. Alleen die ene
  // variant wordt extra geaccepteerd; elke andere origin blijft geweigerd.
  function siblingOrigin(o) {
    var m = /^(https?:\/\/)([^\/:]+)(:\d+)?$/.exec(o);
    if (!m) return null;
    var h = m[2];
    if (h.indexOf('.') < 0 || /^[\d.]+$/.test(h)) return null; // localhost / IP
    var alt = h.indexOf('www.') === 0 ? h.slice(4) : 'www.' + h;
    if (alt.indexOf('.') < 0) return null;
    return m[1] + alt + (m[3] || '');
  }
  var altOrigin = siblingOrigin(origin);
  // Origin waarop de iframe werkelijk draait (na een eventuele redirect); wordt
  // bijgewerkt bij het eerste geldige bericht uit de iframe.
  var frameOrigin = origin;

  var host = encodeURIComponent(window.location.hostname || 'onbekend');

  // De widget rendert ín de iframe en weet daar niet hoe breed de échte hostpagina
  // is (zijn eigen viewport = de iframe-breedte). De loader draait in de hostpagina,
  // bepaalt of het een mobiel scherm is en geeft dat door via postMessage.
  var MOBILE_MQ = window.matchMedia('(max-width: 639px)');
  function hostMobile() {
    return MOBILE_MQ.matches;
  }

  var SIZES = {
    collapsed: { width: '110px', height: '110px' },
    peek: { width: 'min(380px, 100vw)', height: '168px' },
    openDesktop: { width: 'min(480px, 100vw)', height: 'min(720px, 100dvh)' },
    openMobile: { width: '100vw', height: '100dvh' },
  };

  function sizeFor(state) {
    if (state === 'open') return hostMobile() ? SIZES.openMobile : SIZES.openDesktop;
    if (state === 'peek') return SIZES.peek;
    return SIZES.collapsed;
  }

  var iframe = document.createElement('iframe');
  iframe.title = 'Chat';
  // &m=1 = anti-flits: de widget weet bij eerste render al of de host mobiel is.
  iframe.src =
    origin + '/embed-v1/' + encodeURIComponent(org) + '?h=' + host + (hostMobile() ? '&m=1' : '');
  iframe.setAttribute('allow', '');

  // Alles met !important: host-thema's met bv. iframe{max-width:100%!important;
  // height:auto!important;position:relative!important} slopen de widget anders.
  function css(prop, value) {
    iframe.style.setProperty(prop, value, 'important');
  }
  var BASE = {
    position: 'fixed',
    top: 'auto',
    bottom: '0',
    right: '0',
    left: 'auto',
    border: '0',
    margin: '0',
    padding: '0',
    display: 'block',
    'max-width': 'none',
    'max-height': 'none',
    'min-width': '0',
    'min-height': '0',
    background: 'transparent',
    'z-index': '2147483000',
    width: SIZES.collapsed.width,
    height: SIZES.collapsed.height,
    'color-scheme': 'normal',
  };
  for (var k in BASE) {
    if (Object.prototype.hasOwnProperty.call(BASE, k)) css(k, BASE[k]);
  }

  var currentState = 'collapsed';

  function applySize(state) {
    var size = sizeFor(state);
    css('width', size.width);
    css('height', size.height);
  }

  function applySide(side) {
    if (side === 'bottom-left') {
      css('left', '0');
      css('right', 'auto');
    } else {
      css('right', '0');
      css('left', 'auto');
    }
  }

  // Vertel de widget of de host mobiel is (render-variant: fullscreen vs kaart).
  function postHostState() {
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'chatmanta:host', mobile: hostMobile() }, frameOrigin);
      }
    } catch (e) {
      // contentWindow nog niet klaar — de 'ready'-ping triggert straks alsnog.
    }
  }

  function onMessage(e) {
    if (e.origin !== origin && (altOrigin === null || e.origin !== altOrigin)) return;
    if (iframe.contentWindow && e.source && e.source !== iframe.contentWindow) return;
    frameOrigin = e.origin;
    var d = e.data;
    if (!d) return;
    if (d.type === 'chatmanta:ready') {
      postHostState();
      return;
    }
    if (d.type !== 'chatmanta:resize') return;
    currentState = d.state === 'open' ? 'open' : d.state === 'peek' ? 'peek' : 'collapsed';
    applySize(currentState);
    applySide(d.side === 'bottom-left' ? 'bottom-left' : 'bottom-right');
  }

  function onMqChange() {
    postHostState();
    applySize(currentState);
  }

  function mount() {
    if (!document.body) {
      console.warn(PREFIX + 'geen <body> gevonden — niets geladen.');
      return;
    }
    document.body.appendChild(iframe);
    window.addEventListener('message', onMessage);
    iframe.addEventListener('load', postHostState);
    if (MOBILE_MQ.addEventListener) MOBILE_MQ.addEventListener('change', onMqChange);
    else if (MOBILE_MQ.addListener) MOBILE_MQ.addListener(onMqChange); // oudere Safari
  }

  // In <head> zonder defer (of met async) bestaat <body> nog niet: wacht erop.
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
