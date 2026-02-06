'use client';

import { AppLayout } from '@/components/layout';
import { CanvasClient } from '@/components/canvas/CanvasClient';

export default function CanvasPage() {
  return (
    <AppLayout showSidebar={false} fullHeight>
      <CanvasClient />
    </AppLayout>
  );
}
