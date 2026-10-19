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
    text: 'Dat kan ik niet met zekerheid zeggen: op de website staat niets over een zaterdagservice. Neem gerust contact op, dan wordt het voor je nagekeken.',
  },
];

/**
 * Probleem + "Liever eerlijk dan verzonnen" in één donkere sectie (vroeger twee secties:
 * Probleem met drie kaarten + inbox, en Eerlijk). De lede noemt het probleem, de split laat
 * het verschil zien: een gewone chatbot (verzint) naast ChatManta (eerlijk). Eronder de
 * vertrouwensregels die eerst een eigen strook onder de hero hadden.
 *
 * Eerlijk over het product: GEEN bronlinks (V1 toont die niet, hard rule 9) en geen bot die
 * zelf om gegevens vraagt; contact loopt via de (opt-in) contactknop in de widget.
 */
export default function Honest() {
  return (
    <Section id={SECTION_IDS.honest} variant="dark" className="s-honest" labelledBy="h-honest">
      <Reveal>
        <SectionHead
          titleId="h-honest"
          title="Liever eerlijk dan verzonnen."
          lede="Je klanten stellen hun vragen ook als jij er niet bent. Veel chatbots vullen dat gat met een verzonnen levertijd, prijs of garantie. ChatManta antwoordt alleen met wat er op jouw website en in je documenten staat. Staat het er niet, dan zegt hij dat."
        />
      </Reveal>
      <HonestSplit
        question={QUESTION}
        bad={BAD}
        good={GOOD}
        note="Staat nergens op de site"
        callback="Liever persoonlijk contact?"
        badLabel={
          <>
            <Icon name="info" />
            Een gewone chatbot
          </>
        }
        goodLabel="ChatManta"
      />
      <ul className="strip" aria-label="Waarom je ChatManta kunt vertrouwen">
        <li>
          <Icon name="shieldCheck" />
          Antwoordt alleen uit jouw content
        </li>
        <li>
          <Icon name="globe" />
          Opgeslagen in Europa
        </li>
        <li>
          <Icon name="docCheck" />
          Verwerkersovereenkomst beschikbaar
        </li>
        <li>
          <Icon name="chat" />
          Volledig Nederlands
        </li>
      </ul>
    </Section>
  );
}
