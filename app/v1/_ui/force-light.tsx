// V1 is voor de launch alleen licht (spec §2). Het root-bootscript zet
// html.dark op basis van localStorage; dit inline script draait direct daarna
// tijdens het parsen en haalt het weer weg, vóór de eerste paint van de V1-inhoud.
const SCRIPT =
  "try{var r=document.documentElement;r.classList.remove('dark');r.setAttribute('data-theme','light');}catch(e){}";

export function ForceLight() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
