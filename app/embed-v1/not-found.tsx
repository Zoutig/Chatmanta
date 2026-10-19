// 404 van de embed-route (onbekende/verkeerde slug in data-org, verwijderde org).
// Deze pagina draait in de iframe van public/widget-v1.js: een 110x110-vlak rechtsonder
// op de site van de KLANT. Daarom bewust een transparante, lege pagina zonder
// zichtbare chrome (zoals de 'paused'- en 'blocked'-staat in [slug]/page.tsx), plus
// een console-uitleg voor de site-eigenaar. Verbergen van de iframe zelf kan niet:
// daar is geen bericht voor in het loader-contract, en dat breiden we hier niet uit.
import { EmbedNotFoundNotice } from './embed-not-found-notice';

const TRANSPARENT = `html,body{background:transparent!important;margin:0;padding:0;overflow:hidden}`;

export default function EmbedV1NotFound() {
  return (
    <>
      <style>{TRANSPARENT}</style>
      <EmbedNotFoundNotice />
    </>
  );
}
