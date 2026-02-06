/**
 * Intent Interview Golden Scenarios - Barrel Export
 *
 * Provides a typed registry of all golden test scenarios for the
 * Intent Interview agent evaluation suite.
 *
 * @see ../scenario-schema.ts for the scenario interface definition
 */

import { join } from 'path';

export interface ScenarioEntry {
  /** Unique scenario identifier */
  id: string;
  /** Absolute file path to the scenario JSON */
  filePath: string;
  /** Tags for filtering scenarios by category */
  tags: string[];
}

const SCENARIOS_DIR = __dirname;

/**
 * All 25 golden scenarios for Intent Interview agent evaluation.
 *
 * Categories:
 *   - vague (5): Ambiguous or underspecified user requests
 *   - conflicting-constraints (5): Mutually-exclusive requirements requiring tradeoff negotiation
 *   - implementation-detail (5): Users specifying HOW instead of WHAT; agent must redirect
 *   - domain-specific (5): Domain-rich scenarios with explicit invariants
 *   - edge-case (5): Boundary conditions for agent robustness
 */
export const SCENARIOS: ScenarioEntry[] = [
  // === Vague Requests ===
  {
    id: 'int-001',
    filePath: join(SCENARIOS_DIR, 'int-001-vague-auth.json'),
    tags: ['vague', 'ambiguous', 'authentication'],
  },
  {
    id: 'int-002',
    filePath: join(SCENARIOS_DIR, 'int-002-vague-feature.json'),
    tags: ['vague', 'ambiguous', 'search', 'feature'],
  },
  {
    id: 'int-003',
    filePath: join(SCENARIOS_DIR, 'int-003-vague-performance.json'),
    tags: ['vague', 'ambiguous', 'performance'],
  },
  {
    id: 'int-004',
    filePath: join(SCENARIOS_DIR, 'int-004-vague-notifications.json'),
    tags: ['vague', 'ambiguous', 'notifications'],
  },
  {
    id: 'int-005',
    filePath: join(SCENARIOS_DIR, 'int-005-vague-reporting.json'),
    tags: ['vague', 'ambiguous', 'reporting', 'analytics'],
  },

  // === Conflicting Constraints ===
  {
    id: 'int-006',
    filePath: join(SCENARIOS_DIR, 'int-006-conflict-realtime-cost.json'),
    tags: ['conflicting-constraints', 'real-time', 'cost', 'tradeoff'],
  },
  {
    id: 'int-007',
    filePath: join(SCENARIOS_DIR, 'int-007-conflict-security-ux.json'),
    tags: ['conflicting-constraints', 'security', 'ux', 'tradeoff'],
  },
  {
    id: 'int-008',
    filePath: join(SCENARIOS_DIR, 'int-008-conflict-offline-sync.json'),
    tags: ['conflicting-constraints', 'offline', 'sync', 'tradeoff'],
  },
  {
    id: 'int-009',
    filePath: join(SCENARIOS_DIR, 'int-009-conflict-fast-thorough.json'),
    tags: ['conflicting-constraints', 'validation', 'performance', 'tradeoff'],
  },
  {
    id: 'int-010',
    filePath: join(SCENARIOS_DIR, 'int-010-conflict-flexible-strict.json'),
    tags: ['conflicting-constraints', 'schema', 'validation', 'tradeoff'],
  },

  // === Implementation Detail Pushback ===
  {
    id: 'int-011',
    filePath: join(SCENARIOS_DIR, 'int-011-impl-database.json'),
    tags: ['implementation-detail', 'pushback', 'database', 'technology-choice'],
  },
  {
    id: 'int-012',
    filePath: join(SCENARIOS_DIR, 'int-012-impl-framework.json'),
    tags: ['implementation-detail', 'pushback', 'framework', 'technology-choice'],
  },
  {
    id: 'int-013',
    filePath: join(SCENARIOS_DIR, 'int-013-impl-api-design.json'),
    tags: ['implementation-detail', 'pushback', 'api', 'architecture'],
  },
  {
    id: 'int-014',
    filePath: join(SCENARIOS_DIR, 'int-014-impl-caching.json'),
    tags: ['implementation-detail', 'pushback', 'caching', 'technology-choice'],
  },
  {
    id: 'int-015',
    filePath: join(SCENARIOS_DIR, 'int-015-impl-microservices.json'),
    tags: ['implementation-detail', 'pushback', 'microservices', 'architecture'],
  },

  // === Domain-Specific with Invariants ===
  {
    id: 'int-016',
    filePath: join(SCENARIOS_DIR, 'int-016-domain-payment.json'),
    tags: ['domain-specific', 'payment', 'security', 'invariants', 'compliance'],
  },
  {
    id: 'int-017',
    filePath: join(SCENARIOS_DIR, 'int-017-domain-healthcare.json'),
    tags: ['domain-specific', 'healthcare', 'privacy', 'invariants', 'hipaa'],
  },
  {
    id: 'int-018',
    filePath: join(SCENARIOS_DIR, 'int-018-domain-auction.json'),
    tags: ['domain-specific', 'auction', 'consistency', 'invariants', 'real-time'],
  },
  {
    id: 'int-019',
    filePath: join(SCENARIOS_DIR, 'int-019-domain-inventory.json'),
    tags: ['domain-specific', 'inventory', 'integrity', 'invariants', 'warehouse'],
  },
  {
    id: 'int-020',
    filePath: join(SCENARIOS_DIR, 'int-020-domain-scheduling.json'),
    tags: ['domain-specific', 'scheduling', 'conflict-resolution', 'invariants'],
  },

  // === Edge Cases ===
  {
    id: 'int-021',
    filePath: join(SCENARIOS_DIR, 'int-021-edge-empty.json'),
    tags: ['edge-case', 'minimal-input', 'ambiguous'],
  },
  {
    id: 'int-022',
    filePath: join(SCENARIOS_DIR, 'int-022-edge-complex.json'),
    tags: ['edge-case', 'complex', 'multi-feature', 'overwhelming'],
  },
  {
    id: 'int-023',
    filePath: join(SCENARIOS_DIR, 'int-023-edge-contradictory.json'),
    tags: ['edge-case', 'contradictory', 'inconsistency', 'adversarial'],
  },
  {
    id: 'int-024',
    filePath: join(SCENARIOS_DIR, 'int-024-edge-done-early.json'),
    tags: ['edge-case', 'early-termination', 'incomplete'],
  },
  {
    id: 'int-025',
    filePath: join(SCENARIOS_DIR, 'int-025-edge-all-answered.json'),
    tags: ['edge-case', 'comprehensive', 'well-specified'],
  },
];

/**
 * Filter scenarios by one or more tags.
 * Returns scenarios that match ALL provided tags.
 */
export function filterScenariosByTags(tags: string[]): ScenarioEntry[] {
  return SCENARIOS.filter((scenario) => tags.every((tag) => scenario.tags.includes(tag)));
}

/**
 * Get a single scenario entry by ID.
 */
export function getScenarioById(id: string): ScenarioEntry | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
