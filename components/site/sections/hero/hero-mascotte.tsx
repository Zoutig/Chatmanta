'use client';

import { MantaMascotte } from '../../mascotte/manta-mascotte';

/** De mascotte boven de hero-chat; de chat stuurt hem aan via signalMascotte(). */
export function HeroMascotte() {
  return <MantaMascotte className="hero-mascotte" />;
}
