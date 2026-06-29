/* ChatManta V1 embeddable widget loader. Gebruik:
   <script src="https://<host>/widget-v1.js" data-org="acme-corp" defer></script>
   Port van public/widget.js; enig verschil: iframe.src wijst naar /embed-v1/. */
(function () {
  if (window.__chatmantaWidgetV1Loaded) return;
  window.__chatmantaWidgetV1Loaded = true;

  var script = document.currentScript;
  if (!script) return;
  var org = script.getAttribute('data-org') || script.getAttribute('data-chatbot');
  if (!org) {
    console.warn('[chatmanta] widget-v1.js: ontbrekend data-org attribuut — niets geladen.');
    return;
  }

  // App-origin = waar widget-v1.js vandaan komt. Werkt op localhost en prod.
  var origin = new URL(script.src).origin;
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
      // contentWindow nog niet klaar — de 'ready'-ping triggert straks alsnog.
    }
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== origin) return;
    var d = e.data;
    if (!d) return;
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

  iframe.addEventListener('load', postHostState);

  function onMqChange() {
    postHostState();
    applySize(currentState);
  }
  if (MOBILE_MQ.addEventListener) MOBILE_MQ.addEventListener('change', onMqChange);
  else if (MOBILE_MQ.addListener) MOBILE_MQ.addListener(onMqChange); // oudere Safari
})();
