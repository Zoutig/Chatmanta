/* ChatManta embeddable widget loader. Gebruik:
   <script src="https://<host>/widget.js" data-org="acme-corp" defer></script> */
(function () {
  if (window.__chatmantaWidgetLoaded) return;
  window.__chatmantaWidgetLoaded = true;

  var script = document.currentScript;
  if (!script) return;
  var org = script.getAttribute('data-org');
  if (!org) {
    console.warn('[chatmanta] widget.js: ontbrekend data-org attribuut — niets geladen.');
    return;
  }

  // App-origin = waar widget.js vandaan komt. Werkt op localhost en prod.
  var origin = new URL(script.src).origin;
  var host = encodeURIComponent(window.location.hostname || 'onbekend');

  // De widget rendert ín de iframe en weet daar niet hoe breed de échte
  // hostpagina is (zijn eigen viewport = de iframe-breedte). Daarom bepaalt de
  // loader — die in de hostpagina draait — of het een mobiel scherm is en geeft
  // dat door. Zonder dit zou de widget altijd zijn fullscreen "mobiele" paneel
  // tonen (scherpe hoeken, geen schaduw) omdat de iframe smal is.
  var MOBILE_MQ = window.matchMedia('(max-width: 639px)');
  function hostMobile() {
    return MOBILE_MQ.matches;
  }

  var SIZES = {
    // Iets ruimer dan de FAB zelf zodat de pulsering + zachte schaduw niet tegen
    // de iframe-rand clippen. De FAB blijft 24px van de hoek (geankerd ín de
    // iframe); de extra ruimte is transparant naar boven-links.
    collapsed: { width: '110px', height: '110px' },
    // peek = FAB + launcher-tooltip erboven; ruim genoeg zodat de tooltip niet clipt.
    peek: { width: 'min(380px, 100vw)', height: '168px' },
    // Desktop: zwevend paneel met ruimte rondom voor de schaduw. Mobiel: echt
    // fullscreen (host-viewport), zoals de widget zelf z'n mobiele paneel rendert.
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
  // &m=1 = anti-flits: de widget weet bij eerste render al of de host mobiel is,
  // zodat hij niet eerst de desktop-kaart toont en dan naar fullscreen springt.
  iframe.src =
    origin + '/embed/' + encodeURIComponent(org) + '?h=' + host + (hostMobile() ? '&m=1' : '');
  iframe.setAttribute('allow', '');
  iframe.style.cssText = [
    'position:fixed',
    'bottom:0',
    'right:0',
    'border:0',
    'background:transparent',
    'z-index:2147483000',
    'width:' + SIZES.collapsed.width,
    'height:' + SIZES.collapsed.height,
    'color-scheme:normal',
  ].join(';');
  document.body.appendChild(iframe);

  var currentState = 'collapsed';
  var currentSide = 'bottom-right';

  function applySize(state) {
    var size = sizeFor(state);
    iframe.style.width = size.width;
    iframe.style.height = size.height;
  }

  function applySide(side) {
    if (side === 'bottom-left') {
      iframe.style.left = '0';
      iframe.style.right = 'auto';
    } else {
      iframe.style.right = '0';
      iframe.style.left = 'auto';
    }
  }

  // Vertel de widget of de host mobiel is (render-variant: fullscreen vs kaart).
  function postHostState() {
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'chatmanta:host', mobile: hostMobile() }, origin);
      }
    } catch (e) {
      // contentWindow nog niet klaar — de 'ready'-ping van de widget triggert
      // straks alsnog een nieuwe postHostState().
    }
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== origin) return;
    var d = e.data;
    if (!d) return;
    // De widget meldt zich klaar → stuur de host-status (sluit de race waarbij
    // onze iframe-load-post vóór de listener van de widget zou aankomen).
    if (d.type === 'chatmanta:ready') {
      postHostState();
      return;
    }
    if (d.type !== 'chatmanta:resize') return;
    currentState = d.state === 'open' ? 'open' : d.state === 'peek' ? 'peek' : 'collapsed';
    currentSide = d.side === 'bottom-left' ? 'bottom-left' : 'bottom-right';
    applySize(currentState);
    applySide(currentSide);
  });

  // Backup naast de 'ready'-ping: stuur host-status zodra de iframe geladen is.
  iframe.addEventListener('load', postHostState);

  // Hostviewport wisselt desktop<->mobiel: widget herrenderen + open-iframe
  // herschalen (fullscreen ↔ zwevend paneel).
  function onMqChange() {
    postHostState();
    applySize(currentState);
  }
  if (MOBILE_MQ.addEventListener) MOBILE_MQ.addEventListener('change', onMqChange);
  else if (MOBILE_MQ.addListener) MOBILE_MQ.addListener(onMqChange); // oudere Safari
})();
