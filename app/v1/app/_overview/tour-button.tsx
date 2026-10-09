'use client';

// Start de rondleiding opnieuw. Zelfde gedrag als de V0-StartTourButton
// (window-event waar OnboardingTour op luistert), maar met de V1-knop.

import { START_TOUR_EVENT } from '@/app/v1/_ui/tour';
import { Button } from '@/app/v1/_ui/button';

export function TourButton() {
  return (
    <Button variant="ghost" onClick={() => window.dispatchEvent(new Event(START_TOUR_EVENT))}>
      Rondleiding
    </Button>
  );
}
