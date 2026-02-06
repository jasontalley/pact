import type { Atom } from '@/types/atom';

/**
 * WebSocket event types for atoms
 */
export type AtomEvent =
  | { type: 'atom:created'; data: Atom }
  | { type: 'atom:updated'; data: Atom }
  | { type: 'atom:committed'; atomId: string; data: Atom }
  | { type: 'atom:superseded'; atomId: string; newAtomId: string }
  | { type: 'atom:deleted'; atomId: string }
  | { type: 'quality:updated'; atomId: string; score: number };

/**
 * Event names for subscribing
 */
export const ATOM_EVENTS = {
  CREATED: 'atom:created',
  UPDATED: 'atom:updated',
  COMMITTED: 'atom:committed',
  SUPERSEDED: 'atom:superseded',
  DELETED: 'atom:deleted',
  QUALITY_UPDATED: 'quality:updated',
} as const;
