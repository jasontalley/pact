'use client';

import { CreateAtomDialog } from '@/components/atoms/CreateAtomDialog';
import { useAtomEvents } from '@/hooks/socket/use-atom-events';

/**
 * Global client components that need to be rendered on every page
 */
export function GlobalComponents() {
  // Subscribe to real-time atom events
  useAtomEvents();

  return (
    <>
      <CreateAtomDialog />
    </>
  );
}
