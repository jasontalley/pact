import { describe, it, expect } from 'vitest';
import { ATOM_EVENTS } from '@/lib/socket/events';
import type { AtomEvent } from '@/lib/socket/events';

describe('socket events', () => {
  describe('ATOM_EVENTS', () => {
    // @atom IA-WS-002
    it('has correct event names', () => {
      // Verify CREATED event follows the atom:created naming convention
      expect(ATOM_EVENTS.CREATED).toBe('atom:created');
      // Verify UPDATED event follows the atom:updated naming convention
      expect(ATOM_EVENTS.UPDATED).toBe('atom:updated');
      // Verify COMMITTED event follows the atom:committed naming convention
      expect(ATOM_EVENTS.COMMITTED).toBe('atom:committed');
      // Verify SUPERSEDED event follows the atom:superseded naming convention
      expect(ATOM_EVENTS.SUPERSEDED).toBe('atom:superseded');
      // Verify DELETED event follows the atom:deleted naming convention
      expect(ATOM_EVENTS.DELETED).toBe('atom:deleted');
      // Verify QUALITY_UPDATED event follows the quality:updated naming convention
      expect(ATOM_EVENTS.QUALITY_UPDATED).toBe('quality:updated');
    });

    // @atom IA-WS-002
    it('contains all expected event types', () => {
      const expectedEvents = [
        'CREATED',
        'UPDATED',
        'COMMITTED',
        'SUPERSEDED',
        'DELETED',
        'QUALITY_UPDATED',
      ];

      // Verify ATOM_EVENTS object contains exactly the expected event type keys
      expect(Object.keys(ATOM_EVENTS)).toEqual(expectedEvents);
    });

    // @atom IA-WS-002
    it('has unique event values (no duplicate event strings)', () => {
      const eventValues = Object.values(ATOM_EVENTS);
      const uniqueValues = new Set(eventValues);

      // Verify all event string values are unique to prevent event collision
      expect(uniqueValues.size).toBe(eventValues.length);
    });

    // @atom IA-WS-002
    it('event names are non-empty strings', () => {
      const eventValues = Object.values(ATOM_EVENTS);

      // Verify each event value is a non-empty string (boundary: empty string check)
      eventValues.forEach((value) => {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      });
    });
  });

  describe('AtomEvent type', () => {
    // @atom IA-WS-002
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
      // Verify atom:created event type is correctly assigned
      expect(event.type).toBe('atom:created');
    });

    // @atom IA-WS-002
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
      // Verify atom:committed event type is correctly assigned
      expect(event.type).toBe('atom:committed');
    });

    // @atom IA-WS-002
    it('supports atom:superseded event', () => {
      const event: AtomEvent = {
        type: 'atom:superseded',
        atomId: 'IA-001',
        newAtomId: 'IA-002',
      };
      // Verify atom:superseded event type is correctly assigned
      expect(event.type).toBe('atom:superseded');
    });

    // @atom IA-WS-002
    it('supports atom:deleted event', () => {
      const event: AtomEvent = {
        type: 'atom:deleted',
        atomId: 'IA-001',
      };
      // Verify atom:deleted event type is correctly assigned
      expect(event.type).toBe('atom:deleted');
    });

    // @atom IA-WS-002
    it('supports quality:updated event', () => {
      const event: AtomEvent = {
        type: 'quality:updated',
        atomId: 'IA-001',
        score: 90,
      };
      // Verify quality:updated event type is correctly assigned
      expect(event.type).toBe('quality:updated');
    });

    // @atom IA-WS-002
    it('handles quality:updated event with minimum score boundary (0)', () => {
      const event: AtomEvent = {
        type: 'quality:updated',
        atomId: 'IA-001',
        score: 0,
      };
      // Verify event type is correctly set for minimum score boundary
      expect(event.type).toBe('quality:updated');
      // Verify minimum score value (0) is preserved without modification
      expect(event.score).toBe(0);
    });

    // @atom IA-WS-002
    it('handles quality:updated event with maximum score boundary (100)', () => {
      const event: AtomEvent = {
        type: 'quality:updated',
        atomId: 'IA-001',
        score: 100,
      };
      // Verify event type is correctly set for maximum score boundary
      expect(event.type).toBe('quality:updated');
      // Verify maximum score value (100) is preserved without modification
      expect(event.score).toBe(100);
    });

    // @atom IA-WS-002
    it('handles atom:created event with empty tags array (boundary case)', () => {
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
      // Verify event with empty tags array is valid (boundary: empty collection)
      expect(event.data.tags).toEqual([]);
      // Verify tags array length is zero
      expect(event.data.tags.length).toBe(0);
    });

    // @atom IA-WS-002
    it('handles atom:created event with multiple tags (populated collection)', () => {
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
          tags: ['security', 'authentication', 'validation'],
        },
      };
      // Verify event with populated tags array contains expected values
      expect(event.data.tags).toContain('security');
      expect(event.data.tags).toContain('authentication');
      // Verify tags array has correct length
      expect(event.data.tags.length).toBe(3);
    });
  });
});
