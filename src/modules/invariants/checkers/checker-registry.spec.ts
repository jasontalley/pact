import { CheckerRegistry } from './checker-registry';
import { InvariantChecker, InvariantCheckResult, CheckContext } from './interfaces';
import { InvariantConfig } from '../invariant-config.entity';
import { Atom } from '../../atoms/atom.entity';

describe('CheckerRegistry', () => {
  let registry: CheckerRegistry;

  beforeEach(() => {
    registry = new CheckerRegistry();
  });

  describe('built-in checker registration', () => {
    it('should register all 9 built-in checkers on instantiation', () => {
      expect(registry.size).toBe(9);
    });

    it('should have checker for INV-001', () => {
      expect(registry.has('INV-001')).toBe(true);
      const checker = registry.get('INV-001');
      expect(checker?.invariantId).toBe('INV-001');
    });

    it('should have checker for INV-002', () => {
      expect(registry.has('INV-002')).toBe(true);
    });

    it('should have checker for INV-003', () => {
      expect(registry.has('INV-003')).toBe(true);
    });

    it('should have checker for INV-004', () => {
      expect(registry.has('INV-004')).toBe(true);
    });

    it('should have checker for INV-005', () => {
      expect(registry.has('INV-005')).toBe(true);
    });

    it('should have checker for INV-006', () => {
      expect(registry.has('INV-006')).toBe(true);
    });

    it('should have checker for INV-007', () => {
      expect(registry.has('INV-007')).toBe(true);
    });

    it('should have checker for INV-008', () => {
      expect(registry.has('INV-008')).toBe(true);
    });

    it('should have checker for INV-009', () => {
      expect(registry.has('INV-009')).toBe(true);
    });

    it('should return all checkers via getAll()', () => {
      const checkers = registry.getAll();
      expect(checkers).toHaveLength(9);
      const ids = checkers.map((c) => c.invariantId);
      expect(ids).toContain('INV-001');
      expect(ids).toContain('INV-009');
    });
  });

  describe('custom checker registration', () => {
    it('should allow registering custom checkers', () => {
      const customChecker: InvariantChecker = {
        invariantId: 'CUSTOM-001',
        check: jest.fn().mockResolvedValue({
          invariantId: 'CUSTOM-001',
          name: 'Custom Check',
          passed: true,
          severity: 'error' as const,
          message: 'Custom check passed',
          affectedAtomIds: [],
          suggestions: [],
        }),
      };

      registry.register(customChecker);

      expect(registry.has('CUSTOM-001')).toBe(true);
      expect(registry.size).toBe(10);
    });

    it('should overwrite existing checker when registering same invariantId', () => {
      const checker1 = registry.get('INV-001');
      const customChecker: InvariantChecker = {
        invariantId: 'INV-001',
        check: jest.fn().mockResolvedValue({
          invariantId: 'INV-001',
          name: 'Custom INV-001',
          passed: true,
          severity: 'error' as const,
          message: 'Custom passed',
          affectedAtomIds: [],
          suggestions: [],
        }),
      };

      registry.register(customChecker);

      const checker2 = registry.get('INV-001');
      expect(checker2).toBe(customChecker);
      expect(checker2).not.toBe(checker1);
      expect(registry.size).toBe(9); // Same count
    });
  });

  describe('unregister', () => {
    it('should unregister a checker', () => {
      expect(registry.has('INV-001')).toBe(true);

      const result = registry.unregister('INV-001');

      expect(result).toBe(true);
      expect(registry.has('INV-001')).toBe(false);
      expect(registry.size).toBe(8);
    });

    it('should return false when unregistering non-existent checker', () => {
      const result = registry.unregister('NON-EXISTENT');
      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent checker', () => {
      expect(registry.get('NON-EXISTENT')).toBeUndefined();
    });
  });
});
