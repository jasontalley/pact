'use client';

import { AppLayout } from '@/components/layout';
import { CommitmentList } from '@/components/commitments';

export default function CommitmentsPage() {
  return (
    <AppLayout showSidebar>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Commitments</h1>
          <p className="text-muted-foreground mt-2">
            Browse all commitment artifacts. Each commitment represents an immutable record of
            intent atoms at a specific point in time.
          </p>
        </div>

        <CommitmentList />
      </div>
    </AppLayout>
  );
}
