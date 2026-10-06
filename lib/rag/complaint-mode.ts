// v0.13 (launch-onderzoek): klacht-modus. Het enige hard-eval-veto van de
// Luna-reeks was een klacht waarbij de bot (bron-gegronde) vergoedings-
// categorieën noemde; bij méér context kwam dat terug (r3). Een systeemregel
// verliest daar van de context → bij een gedetecteerde klacht komt de regel
// ná de vraag in de user-turn (recency wint). Pure functies.

const COMPLAINT_RE =
  /\b(klacht|klagen|ontevreden|niet tevreden|teleurgesteld|boos|woedend|slecht geholpen|onbeschoft|onvriendelijk|nooit (?:meer )?(?:iets )?(?:gehoord|gereageerd|teruggebeld)|niet teruggebeld|onbereikbaar|geld terug|terugbetal\w*|compensatie|schadevergoeding|aansprakelijk\w*)\b/i;
// Schade/fout ÉN veroorzaakt door ons — "beschadigd na de storm, valt dat onder
// de garantie?" is een garantievraag, geen klacht.
const DAMAGE_WORD_RE =
  /\b(schade|kapot|beschadigd|lekt(?:e)? (?:weer|nog steeds)|niet goed (?:gedaan|uitgevoerd)|verprutst|fout gedaan)\b/i;
const CAUSED_BY_US_RE =
  /\b(door jullie|jullie hebben|jullie monteur|uw monteur|jullie medewerker|na jullie|jullie werk|jullie reparatie|jullie behandeling|jullie instructeur)\b/i;

export function isComplaint(texts: string[]): boolean {
  return texts.some(
    (t) => !!t && (COMPLAINT_RE.test(t) || (DAMAGE_WORD_RE.test(t) && CAUSED_BY_US_RE.test(t))),
  );
}

export const COMPLAINT_DIRECTIVE =
  '\n\nKLACHT-MODUS (automatisch): dit lijkt een klacht of schademelding. Toon kort begrip, beloof niets en bied geen vergoeding, compensatie, korting of kosteloos herstel aan. Noem niet welke schade of kosten wel of niet vergoed worden of onder de aansprakelijkheid/garantie vallen — ook niet voorwaardelijk en ook niet als de CONTEXT dat beschrijft; die beoordeling doet een medewerker. Verwijs naar de klachtroute of een medewerker met de contactgegevens uit de CONTEXT.';

// V2 (screening): V1 liet Luna soms een andere dienst als "oplossing" aanbieden
// (gratis proefles als contactroute) en ongevraagd "geen vergoeding" melden.
export const COMPLAINT_DIRECTIVE_V2 =
  '\n\nKLACHT-MODUS (automatisch): dit lijkt een klacht of schademelding. Toon kort begrip en geef de klant de best passende contactroute uit de CONTEXT (klachtroute, telefoon, e-mail, terugbelverzoek, openingstijden). Bied geen vergoeding, compensatie, korting of kosteloos herstel aan en noem niet welke schade of kosten wel of niet vergoed worden of onder aansprakelijkheid/garantie vallen — ook niet voorwaardelijk en ook niet als de CONTEXT dat beschrijft. Vraagt de klant zelf om vergoeding, zeg dan dat je die niet kunt toezeggen en dat een medewerker het beoordeelt; begin er anders niet zelf over. Bied geen andere dienst (zoals een proefles of nieuwe afspraak) aan als oplossing voor de klacht.';
