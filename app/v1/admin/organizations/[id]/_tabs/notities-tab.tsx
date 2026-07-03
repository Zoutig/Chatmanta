// V1 admin — Notities tab (server RSC wrapper).
import { Card } from '@/app/klantendashboard/components/ui/card';
import { NotesEditor } from '../_components/notes-editor';

export function NotitiesTab({ orgId, notes }: { orgId: string; notes: string | null }) {
  return (
    <Card>
      <NotesEditor orgId={orgId} notes={notes} />
    </Card>
  );
}
