import { SECTION_IDS } from '@/lib/site/navigation';
import { Icon } from '../ui/icon';
import { Reveal } from '../ui/reveal';
import { Section, SectionHead } from '../ui/section';
import { HonestSplit, type Seg } from './honest/honest-split';
import './honest.css';

const QUESTION = 'Kunnen jullie zaterdag nog een monteur sturen?';
const BAD: Seg[] = [{ text: 'Ja hoor, ' }, { text: 'zaterdag komt er een monteur tussen 8 en 12 uur!', mark: true }];
const GOOD: Seg[] = [
  {
    text: 'Daar kan ik je helaas geen zeker antwoord op geven, want ik zie op de website geen zaterdagservice. Zal ik je gegevens doorgeven, zodat we je maandag meteen bellen?',
  },
];

/**
 * §7 Liever eerlijk dan verzonnen — donkere nacht-sectie, het contrastmoment van de pagina:
 * een gewone chatbot (verzint) naast ChatManta (eerlijk). Signatuurmoment: beide gesprekken
 * spelen één keer bij in beeld; de verzonnen zin krijgt een oranje markering.
 */
export default function Honest() {
  return (
    <Section id={SECTION_IDS.honest} variant="dark" className="s-honest" labelledBy="h-honest">
      <Reveal>
        <SectionHead
          center
          eyebrow="Ons uitgangspunt"
          titleId="h-honest"
          title="Liever eerlijk dan verzonnen."
          lede="Veel chatbots doen alsof ze alles weten. Dan verzinnen ze een levertijd, een prijs of een garantie die niet bestaat, en jij moet het uitleggen. ChatManta werkt anders: hij antwoordt alleen met wat er in jouw website en documenten staat. Staat het er niet? Dan zegt hij dat gewoon en biedt hij aan om je klant met jou in contact te brengen."
        />
      </Reveal>
      <HonestSplit
        question={QUESTION}
        bad={BAD}
        good={GOOD}
        note="Staat nergens op de site"
        callback="Ja, bel me terug"
        callbackDone="Doorgegeven"
        badLabel={
          <>
            <Icon name="info" />
            Een gewone chatbot
          </>
        }
        goodLabel="ChatManta"
      />
      <ul className="strip">
        <li>
          <Icon name="check" />
          Alleen uit jouw content
        </li>
        <li>
          <Icon name="check" />
          Altijd met bronlink
        </li>
        <li>
          <Icon name="check" />
          Weet hij het niet, dan zegt hij het
        </li>
      </ul>
    </Section>
  );
}
