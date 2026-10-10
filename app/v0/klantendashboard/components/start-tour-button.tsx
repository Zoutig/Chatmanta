'use client';

// Knop die de rondleiding (her)start via een window-event. Los van de tour zelf
// zodat hij in de (server-rendered) PageHead past — de tour-component luistert
// op START_TOUR_EVENT.

import { Btn } from './ui/btn';
import { START_TOUR_EVENT } from './onboarding-tour';

export function StartTourButton() {
  return (
    <Btn
      variant="ghost"
      onClick={() => window.dispatchEvent(new Event(START_TOUR_EVENT))}
      title="Start de rondleiding opnieuw"
    >
      Rondleiding
    </Btn>
  );
}
