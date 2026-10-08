// Lege laadgrens voor het zijpaneel-slot. Zonder deze grens kan Next de
// laadschermen van de pagina's (children-slot) niet vooraf ophalen, omdat elk
// parallel slot een eigen grens nodig heeft; dan blijft na een klik het oude
// scherm staan in plaats van het skelet.
export default function DrawerSlotLoading() {
  return null;
}
