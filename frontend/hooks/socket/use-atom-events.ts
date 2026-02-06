'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socket, connectSocket, disconnectSocket } from '@/lib/socket/client';
import { ATOM_EVENTS } from '@/lib/socket/events';
import { atomKeys } from '@/hooks/atoms/use-atoms';
import type { Atom } from '@/types/atom';
import { toast } from 'sonner';

/**
 * Hook to subscribe to real-time atom events
 */
export function useAtomEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Connect to WebSocket
    connectSocket();

    // Handle atom created
    socket.on(ATOM_EVENTS.CREATED, (data: { data: Atom }) => {
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      toast.info(`New atom ${data.data.atomId} created`);
    });

    // Handle atom updated
    socket.on(ATOM_EVENTS.UPDATED, (data: { data: Atom }) => {
      // Update specific atom in cache
      queryClient.setQueryData(atomKeys.detail(data.data.id), data.data);
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
    });

    // Handle atom committed
    socket.on(ATOM_EVENTS.COMMITTED, (data: { atomId: string; data: Atom }) => {
      // Update specific atom in cache
      queryClient.setQueryData(atomKeys.detail(data.data.id), data.data);
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      toast.success(`Atom ${data.data.atomId} committed`);
    });

    // Handle atom superseded
    socket.on(ATOM_EVENTS.SUPERSEDED, (data: { atomId: string; newAtomId: string }) => {
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      toast.info(`Atom superseded by ${data.newAtomId}`);
    });

    // Handle atom deleted
    socket.on(ATOM_EVENTS.DELETED, (data: { atomId: string }) => {
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      toast.info('Atom deleted');
    });

    // Cleanup on unmount
    return () => {
      socket.off(ATOM_EVENTS.CREATED);
      socket.off(ATOM_EVENTS.UPDATED);
      socket.off(ATOM_EVENTS.COMMITTED);
      socket.off(ATOM_EVENTS.SUPERSEDED);
      socket.off(ATOM_EVENTS.DELETED);
      disconnectSocket();
    };
  }, [queryClient]);
}
