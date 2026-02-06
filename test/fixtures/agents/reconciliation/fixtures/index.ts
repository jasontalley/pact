/**
 * Reconciliation Agent Golden Fixtures - Barrel Export
 *
 * Provides a unified FIXTURES array for loading all golden test fixtures
 * used to evaluate the Reconciliation agent.
 *
 * @see ../fixture-schema.ts for the ReconciliationFixture interface
 */

export interface FixtureEntry {
  /** Unique fixture identifier */
  id: string;
  /** Relative path to the fixture JSON file (from this directory) */
  filePath: string;
  /** Tags for filtering fixtures in test suites */
  tags: string[];
}

export const FIXTURES: FixtureEntry[] = [
  // Perfect state (baseline)
  {
    id: 'rec-001',
    filePath: './rec-001-perfect-small.json',
    tags: ['perfect', 'small', 'baseline'],
  },
  {
    id: 'rec-002',
    filePath: './rec-002-perfect-with-molecules.json',
    tags: ['perfect', 'molecules', 'baseline'],
  },

  // Orphan tests
  {
    id: 'rec-003',
    filePath: './rec-003-single-orphan.json',
    tags: ['orphan-tests', 'single', 'basic'],
  },
  {
    id: 'rec-004',
    filePath: './rec-004-multiple-orphans.json',
    tags: ['orphan-tests', 'multiple', 'multi-file'],
  },
  {
    id: 'rec-005',
    filePath: './rec-005-orphan-with-context.json',
    tags: ['orphan-tests', 'context-rich', 'imports'],
  },
  {
    id: 'rec-006',
    filePath: './rec-006-orphan-mixed.json',
    tags: ['orphan-tests', 'mixed', 'same-file'],
  },

  // Delta mode
  {
    id: 'rec-007',
    filePath: './rec-007-delta-new-test.json',
    tags: ['delta', 'new-file', 'incremental'],
  },
  {
    id: 'rec-008',
    filePath: './rec-008-delta-changed-linked.json',
    tags: ['delta', 'inv-r001', 'already-linked', 'no-new-atoms'],
  },
  {
    id: 'rec-009',
    filePath: './rec-009-delta-mixed.json',
    tags: ['delta', 'mixed', 'new-and-changed'],
  },

  // Edge cases
  {
    id: 'rec-010',
    filePath: './rec-010-empty-repo.json',
    tags: ['edge-case', 'empty', 'no-tests'],
  },
  {
    id: 'rec-011',
    filePath: './rec-011-all-orphans.json',
    tags: ['edge-case', 'all-orphans', 'stress'],
  },
  {
    id: 'rec-012',
    filePath: './rec-012-complex-deps.json',
    tags: ['edge-case', 'deep-imports', 'complex-deps'],
  },

  // Quality gate
  {
    id: 'rec-013',
    filePath: './rec-013-quality-pass.json',
    tags: ['quality-gate', 'pass', 'high-quality'],
  },
  {
    id: 'rec-014',
    filePath: './rec-014-quality-mixed.json',
    tags: ['quality-gate', 'mixed', 'verification'],
  },
  {
    id: 'rec-015',
    filePath: './rec-015-quality-all-fail.json',
    tags: ['quality-gate', 'all-fail', 'vacuous', 'edge-case'],
  },
];
