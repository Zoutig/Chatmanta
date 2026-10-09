// V1 admin — Notities tab (server RSC wrapper).
import { NotesEditor } from '../_components/notes-editor';

export function NotitiesTab({ orgId, notes }: { orgId: string; notes: string | null }) {
  return (
    <section className="v1-card">
      <NotesEditor orgId={orgId} notes={notes} />
    </section>
  );
}
