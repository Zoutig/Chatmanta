'use client';

// Stap 3 Status: aan/uit (optimistisch, terug bij een fout), of de widget op de
// site gevonden is en wanneer, en "Installatie testen". Status-informatie staat
// nooit ingeklapt (rustregel 4).

import { useState, useTransition } from 'react';
import { Badge } from '@/app/v1/_ui/feedback';
import { Switch } from '@/app/v1/_ui/controls';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { checkWidgetInstallationAction, toggleWidgetActiveAction, type WidgetLiveStatus } from './actions';
import { formatLastSeen } from './format';

export function StatusStep({
  liveStatus,
  widgetMissing,
  missingAfterMs,
}: {
  liveStatus: WidgetLiveStatus;
  /** Server-berekend: eerder gezien, maar al een week niet meer. */
  widgetMissing: boolean;
  /** Drempel uit attention.ts (die module is server-only, dus als prop). */
  missingAfterMs: number;
}) {
  const toast = useToast();
  const [live, setLive] = useState<WidgetLiveStatus>(liveStatus);
  const [toggling, startToggle] = useTransition();
  const [checking, startCheck] = useTransition();
  // Begint bij de serverwaarde; na een installatie-test of aan/uit opnieuw
  // bepaald (in een handler, niet tijdens render: hydration).
  const [missing, setMissing] = useState(widgetMissing);

  function toggle(next: boolean) {
    const prev = live.isActive;
    setLive((l) => ({ ...l, isActive: next }));
    startToggle(async () => {
      const res = await toggleWidgetActiveAction(next);
      if (res.ok) {
        setLive((l) => ({ ...l, isActive: res.isActive }));
        if (!res.isActive) setMissing(false);
        toast.success(res.isActive ? 'Je chatbot staat aan' : 'Je chatbot staat op pauze');
      } else {
        setLive((l) => ({ ...l, isActive: prev }));
        toast.error(res.error || 'Wijzigen lukte niet. Probeer het opnieuw.');
      }
    });
  }

  function check() {
    startCheck(async () => {
      const res = await checkWidgetInstallationAction();
      if (!res.ok) {
        toast.error(res.error || 'Testen lukte niet. Probeer het opnieuw.');
        return;
      }
      setLive({ isActive: res.isActive, lastSeenAt: res.lastSeenAt, lastSeenOrigin: res.lastSeenOrigin });
      setMissing(
        res.isActive && !!res.lastSeenAt && Date.now() - Date.parse(res.lastSeenAt) > missingAfterMs,
      );
      if (res.lastSeenAt) toast.success(`Gevonden, laatst gezien ${formatLastSeen(res.lastSeenAt)}`);
      else toast.error('Nog niet gevonden. Open je website een keer en test opnieuw.');
    });
  }

  return (
    <section className="v1-wg-step" aria-labelledby="wg-step-3">
      <h2 id="wg-step-3" className="v1-wg-step-title">
        <span className="v1-wg-step-num">3</span> Status
      </h2>
      <div className="v1-card v1-wg-status">
        <Switch
          label="Chatbot op je website"
          description={
            live.isActive
              ? 'Bezoekers zien de chatknop.'
              : 'Gepauzeerd: bezoekers zien de chatknop niet tot je hem weer aanzet.'
          }
          checked={live.isActive}
          onChange={toggle}
          disabled={toggling}
        />
        <dl className="v1-rows v1-wg-rows">
          <div className="v1-row">
            <dt className="v1-row-label">Gevonden op je site</dt>
            <dd className="v1-row-value">
              {live.lastSeenAt ? (
                <>
                  {missing ? (
                    <Badge tone="warn" dot>
                      Al een week niet gezien
                    </Badge>
                  ) : (
                    <Badge tone="ok" dot>
                      Gevonden
                    </Badge>
                  )}{' '}
                  {live.lastSeenOrigin ? `op ${live.lastSeenOrigin}, ` : ''}laatst gezien {formatLastSeen(live.lastSeenAt)}
                </>
              ) : (
                <>
                  <Badge tone="neutral">Nog niet gevonden</Badge> Zodra iemand je website opent, zie je het hier.
                </>
              )}
            </dd>
            <div className="v1-row-action">
              <Button variant="secondary" size="sm" onClick={check} loading={checking}>
                Installatie testen
              </Button>
            </div>
          </div>
        </dl>
      </div>
    </section>
  );
}
