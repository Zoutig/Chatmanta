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

  var SIZES = {
    collapsed: { width: '96px', height: '96px' },
    open: { width: 'min(420px, 100vw)', height: 'min(640px, 100dvh)' },
  };

  var iframe = document.createElement('iframe');
  iframe.title = 'Chat';
  iframe.src = origin + '/embed/' + encodeURIComponent(org) + '?h=' + host;
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

  window.addEventListener('message', function (e) {
    if (e.origin !== origin) return;
    var d = e.data;
    if (!d || d.type !== 'chatmanta:resize') return;
    var size = d.state === 'open' ? SIZES.open : SIZES.collapsed;
    iframe.style.width = size.width;
    iframe.style.height = size.height;
    // Side: links of rechts onderaan.
    if (d.side === 'bottom-left') {
      iframe.style.left = '0';
      iframe.style.right = 'auto';
    } else {
      iframe.style.right = '0';
      iframe.style.left = 'auto';
    }
  });
})();
