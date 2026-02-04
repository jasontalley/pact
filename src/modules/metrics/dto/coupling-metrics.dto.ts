/**
 * Coupling Metrics DTOs
 *
 * Represents atom-test-code coupling rates and orphan identification.
 */

export interface AtomSummary {
  id: string;
  atomId: string;
  description: string;
  status: string;
}

export interface TestSummary {
  id: string;
  filePath: string;
  testName: string;
  status: string;
}

/**
 * Distribution of coupling strength across atoms
 */
export interface CouplingStrengthDistribution {
  /** Atoms with coupling strength >= 0.8 */
  strong: number;
  /** Atoms with coupling strength 0.5-0.79 */
  moderate: number;
  /** Atoms with coupling strength < 0.5 */
  weak: number;
}

export interface AtomTestCouplingMetrics {
  totalAtoms: number;
  atomsWithTests: number;
  rate: number;
  orphanAtoms: AtomSummary[];

  // Phase 14C: Coupling strength enhancements

  /**
   * Average coupling strength across all coupled atoms (0-1).
   * Combines test quality, coverage depth, and annotation accuracy.
   */
  averageCouplingStrength: number;

  /**
   * Distribution of coupling strength levels.
   */
  strengthDistribution: CouplingStrengthDistribution;
}

export interface TestAtomCouplingMetrics {
  totalTests: number;
  testsWithAtoms: number;
  rate: number;
  orphanTests: TestSummary[];
}

export interface CodeAtomCoverageMetrics {
  totalSourceFiles: number;
  filesWithAtoms: number;
  rate: number;
  uncoveredFiles: string[];
}

export interface CouplingMetrics {
  atomTestCoupling: AtomTestCouplingMetrics;
  testAtomCoupling: TestAtomCouplingMetrics;
  codeAtomCoverage: CodeAtomCoverageMetrics;
  timestamp: Date;
}
