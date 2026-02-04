'use client';

import { useState } from 'react';
import { AppLayout } from '@/components/layout';
import { ConflictsList } from '@/components/conflicts/ConflictsList';
import { ConflictDetailPanel } from '@/components/conflicts/ConflictDetailPanel';
import { useConflictMetrics } from '@/hooks/conflicts/use-conflicts';
import type { ConflictRecord } from '@/lib/api/conflicts';

export default function ConflictsPage() {
  const [selectedConflict, setSelectedConflict] = useState<ConflictRecord | null>(null);
  const { data: metrics } = useConflictMetrics();

  return (
    <AppLayout showSidebar={false}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Conflicts</h2>
              <p className="text-muted-foreground">
                Review and resolve conflicts between intent atoms
              </p>
            </div>
            {metrics && (
              <div className="flex gap-4 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold">{metrics.total}</p>
                  <p className="text-muted-foreground">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">{metrics.open}</p>
                  <p className="text-muted-foreground">Open</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{metrics.escalated}</p>
                  <p className="text-muted-foreground">Escalated</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{metrics.resolved}</p>
                  <p className="text-muted-foreground">Resolved</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Conflicts list - 2 columns */}
          <div className={selectedConflict ? 'lg:col-span-2' : 'lg:col-span-3'}>
            <ConflictsList
              onSelectConflict={setSelectedConflict}
              selectedConflictId={selectedConflict?.id}
            />
          </div>

          {/* Detail panel - 1 column */}
          {selectedConflict && (
            <div className="lg:col-span-1">
              <ConflictDetailPanel
                conflict={selectedConflict}
                onClose={() => setSelectedConflict(null)}
              />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
