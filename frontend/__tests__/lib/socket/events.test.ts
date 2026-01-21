import { describe, it, expect } from 'vitest';
import { ATOM_EVENTS } from '@/lib/socket/events';
import type { AtomEvent } from '@/lib/socket/events';

describe('socket events', () => {
  describe('ATOM_EVENTS', () => {
    it('has correct event names', () => {
      expect(ATOM_EVENTS.CREATED).toBe('atom:created');
      expect(ATOM_EVENTS.UPDATED).toBe('atom:updated');
      expect(ATOM_EVENTS.COMMITTED).toBe('atom:committed');
      expect(ATOM_EVENTS.SUPERSEDED).toBe('atom:superseded');
      expect(ATOM_EVENTS.DELETED).toBe('atom:deleted');
      expect(ATOM_EVENTS.QUALITY_UPDATED).toBe('quality:updated');
    });

    it('contains all expected event types', () => {
      const expectedEvents = [
        'CREATED',
        'UPDATED',
        'COMMITTED',
        'SUPERSEDED',
        'DELETED',
        'QUALITY_UPDATED',
      ];

      expect(Object.keys(ATOM_EVENTS)).toEqual(expectedEvents);
    });
  });

  describe('AtomEvent type', () => {
    it('supports atom:created event', () => {
      const event: AtomEvent = {
        type: 'atom:created',
        data: {
          id: 'uuid-1',
          atomId: 'IA-001',
          description: 'Test',
          category: 'functional',
          status: 'draft',
          qualityScore: 75,
          createdAt: '2025-06-15T10:00:00Z',
          updatedAt: '2025-06-15T10:00:00Z',
          tags: [],
        },
      };
      expect(event.type).toBe('atom:created');
    });

    it('supports atom:committed event', () => {
      const event: AtomEvent = {
        type: 'atom:committed',
        atomId: 'IA-001',
        data: {
          id: 'uuid-1',
          atomId: 'IA-001',
          description: 'Test',
          category: 'functional',
          status: 'committed',
          qualityScore: 85,
          createdAt: '2025-06-15T10:00:00Z',
          updatedAt: '2025-06-15T10:00:00Z',
          tags: [],
        },
      };
      expect(event.type).toBe('atom:committed');
    });

    it('supports atom:superseded event', () => {
      const event: AtomEvent = {
        type: 'atom:superseded',
        atomId: 'IA-001',
        newAtomId: 'IA-002',
      };
      expect(event.type).toBe('atom:superseded');
    });

    it('supports atom:deleted event', () => {
      const event: AtomEvent = {
        type: 'atom:deleted',
        atomId: 'IA-001',
      };
      expect(event.type).toBe('atom:deleted');
    });

    it('supports quality:updated event', () => {
      const event: AtomEvent = {
        type: 'quality:updated',
        atomId: 'IA-001',
        score: 90,
      };
      expect(event.type).toBe('quality:updated');
    });
  });
});
