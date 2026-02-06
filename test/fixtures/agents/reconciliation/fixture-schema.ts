/**
 * Reconciliation Golden Fixture Schema
 *
 * Defines the structure for golden test fixtures used to evaluate
 * the Reconciliation agent. Each fixture is a minimal codebase snapshot
 * with expected classification and recommendations.
 *
 * @see docs/implementation-checklist-phase13.md (13.3.2.1)
 * @see docs/architecture/agent-contracts.md (Reconciliation contract)
 */

/**
 * A golden fixture for evaluating the Reconciliation agent.
 */
export interface ReconciliationFixture {
  /** Unique fixture identifier */
  id: string;
  /** Human-readable fixture name */
  name: string;
  /** Fixture version for compatibility tracking */
  fixtureVersion: string;
  /** Tags for filtering (e.g., 'perfect', 'ghost-code', 'orphan-tests') */
  tags: string[];
  /** Description of what this fixture tests */
  description: string;

  /** Reconciliation mode to use */
  mode: 'full-scan' | 'delta';

  /** Repository snapshot */
  repo: RepoSnapshot;

  /** Pact registry state (existing atoms, molecules) */
  registry: RegistrySnapshot;

  /** Expected output from the reconciliation */
  expected: ExpectedReconciliationOutput;

  /** Minimum rubric score required to pass (out of 12) */
  minimumRubricScore?: number;
}

/**
 * A minimal repository snapshot for evaluation.
 */
export interface RepoSnapshot {
  /** Files in the repo (path -> content) */
  files: Record<string, string>;
  /** Test files specifically (subset of files keys) */
  testFiles: string[];
  /** Source files (subset of files keys) */
  sourceFiles: string[];
  /** Optional coverage data */
  coverage?: CoverageSnapshot;
  /** Delta mode: files changed since baseline */
  changedFiles?: string[];
}

/**
 * Coverage snapshot for a fixture.
 */
export interface CoverageSnapshot {
  /** Per-file coverage percentages */
  files: Record<
    string,
    {
      statements: number;
      branches: number;
      functions: number;
      lines: number;
    }
  >;
  /** Overall summary */
  summary: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
}

/**
 * Existing Pact registry state (atoms and molecules).
 */
export interface RegistrySnapshot {
  /** Existing atoms in the Pact DB */
  atoms: Array<{
    id: string;
    description: string;
    status: 'draft' | 'committed';
    category: string;
  }>;
  /** Existing molecules */
  molecules: Array<{
    id: string;
    name: string;
    atomIds: string[];
    lensType: string;
  }>;
  /** Existing @atom annotations (test -> atom mapping) */
  annotations: Array<{
    testFilePath: string;
    testName: string;
    atomId: string;
  }>;
}

/**
 * Expected output from the reconciliation.
 */
export interface ExpectedReconciliationOutput {
  /** Expected orphan tests to be discovered */
  orphanTests: Array<{
    filePath: string;
    testName: string;
  }>;
  /** Expected atom recommendations (structural, not exact text) */
  expectedAtomRecommendations: Array<{
    /** Test that should be the source */
    sourceTestFile: string;
    sourceTestName: string;
    /** Description should contain this substring */
    descriptionContains: string;
    /** Minimum confidence */
    minConfidence?: number;
  }>;
  /** Expected molecule groupings (which atoms should cluster) */
  expectedMoleculeGroupings?: Array<{
    /** Minimum atoms in the molecule */
    minAtoms: number;
    /** At least one atom should match this pattern */
    containsAtomDescriptionPattern: string;
  }>;
  /** Tests that should NOT be classified as orphans (have valid @atom) */
  notOrphanTests?: Array<{
    filePath: string;
    testName: string;
  }>;
  /** Expected errors (empty for clean runs) */
  expectedErrors?: string[];
  /** Maximum allowed errors (default: 0 for golden tests) */
  maxErrors?: number;
}

/**
 * Load a fixture from a JSON file.
 */
export function loadFixture(data: Record<string, unknown>): ReconciliationFixture {
  const fixture = data as unknown as ReconciliationFixture;

  // Basic validation
  if (!fixture.id || !fixture.name || !fixture.fixtureVersion) {
    throw new Error(`Invalid fixture: missing required fields (id, name, fixtureVersion)`);
  }
  if (!fixture.repo || !fixture.repo.files) {
    throw new Error(`Fixture ${fixture.id}: must have repo.files`);
  }
  if (!fixture.expected) {
    throw new Error(`Fixture ${fixture.id}: must have expected output`);
  }

  return fixture;
}
