import { AppLayout } from '@/components/layout';
import { ChangeSetDetailView } from '@/components/change-sets/ChangeSetDetailView';

export default async function ChangeSetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppLayout showSidebar={false}>
      <div className="container mx-auto px-4 py-8">
        <ChangeSetDetailView id={id} />
      </div>
    </AppLayout>
  );
}
