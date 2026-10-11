import { ROUTES, SECTION_IDS } from '@/lib/site/navigation';
import { LinkButton } from '../ui/button';
import { Mark } from '../ui/logo';
import { Reveal } from '../ui/reveal';
import { Section } from '../ui/section';
import { DemoFrame } from './live-demo/demo-frame';
import './live-demo.css';

/**
 * §11 Live demo: tekst + knop naar /voorbeeld, en een decoratieve browser-preview van
 * de voorbeeldsite waarin de widget één keer "opent" bij binnenscrollen.
 * Server component; alleen het open-moment zit in de client-subcomponent DemoFrame.
 */
export default function LiveDemo() {
  return (
    <Section
      id={SECTION_IDS.demo}
      variant="default"
      className="s-demo"
      labelledBy="h-demo"
      containerClassName="demo-blk"
    >
      <Reveal>
        <h2 id="h-demo">Probeer hem zelf. Stel een moeilijke vraag.</h2>
        <p className="lede">
          Op onze voorbeeldsite draait een echte ChatManta. Vraag wat je wilt en kijk wat hij doet als hij het antwoord
          niet weet.
        </p>
        <LinkButton href={ROUTES.demo} arrow className="demo-cta">
          Open de live demo
        </LinkButton>
      </Reveal>

      <DemoFrame>
        <div className="bar">
          <i />
          <i />
          <i />
          <span>chatmanta.nl/voorbeeld</span>
        </div>
        <div className="vb">
          <div className="h">
            Voorbeeldbedrijf <i>Diensten · Over ons · Contact</i>
          </div>
          <div className="hero2">
            <b>Een fictieve site met een echte ChatManta.</b>
            <i />
            <i />
          </div>
          <div className="vw">
            <div className="win">
              <div className="wh">Stel je vraag</div>
              <div className="wbody">
                <div className="msg bot">
                  <div className="bubble">Hoi! Waar kan ik je mee helpen?</div>
                </div>
                <div className="msg user">
                  <div className="bubble">Wat als je het niet weet?</div>
                </div>
              </div>
            </div>
            <div className="btnw">
              <Mark />
            </div>
          </div>
        </div>
      </DemoFrame>
    </Section>
  );
}
