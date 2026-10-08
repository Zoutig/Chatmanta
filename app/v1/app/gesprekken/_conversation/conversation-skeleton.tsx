import { Skeleton } from '@/app/v1/_ui/skeleton';

// Klein laadskelet voor het zijpaneel: meta-regel en vier bubbels, afwisselend
// rechts (bezoeker) en links (chatbot), zodat de inhoud op zijn plek invalt.
export function ConversationSkeleton() {
  return (
    <div className="v1-gs-convo" aria-busy="true" aria-label="Gesprek laden">
      <Skeleton width="55%" height={13} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="v1-gs-skel-row" data-side={i % 2 ? 'start' : 'end'}>
          <Skeleton width={i % 2 ? '72%' : '46%'} height={i % 2 ? 72 : 40} radius={16} />
        </div>
      ))}
    </div>
  );
}
