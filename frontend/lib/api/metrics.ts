import { apiClient } from './client';

export interface MetricsTrend {
  date: string;
  epistemicMetrics: Record<string, unknown>;
  couplingMetrics: Record<string, unknown>;
  additionalMetrics: Record<string, unknown> | null;
}

export interface EpistemicLevel {
  count: number;
  percentage: number;
}

export interface EpistemicUnknown {
  orphanTestsCount: number;
  uncoveredCodeFilesCount: number;
}

export interface ProvenBreakdown {
  highConfidence: EpistemicLevel;
  mediumConfidence: EpistemicLevel;
  lowConfidence: EpistemicLevel;
}

export interface CoverageDepth {
  atomsWithCoverage: number;
  averageCoverageDepth: number;
  atomsWithoutCoverage: number;
}

export interface EpistemicMetrics {
  proven: EpistemicLevel;
  committed: EpistemicLevel;
  inferred: EpistemicLevel;
  unknown: EpistemicUnknown;
  totalCertainty: number;
  qualityWeightedCertainty: number;
  provenBreakdown: ProvenBreakdown;
  coverageDepth: CoverageDepth;
  timestamp: string;
}

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

export interface CouplingStrengthDistribution {
  strong: number;
  moderate: number;
  weak: number;
}

export interface AtomTestCouplingMetrics {
  totalAtoms: number;
  atomsWithTests: number;
  rate: number;
  orphanAtoms: AtomSummary[];
  averageCouplingStrength: number;
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
  timestamp: string;
}

export const metricsApi = {
  getEpistemic: async (): Promise<EpistemicMetrics> => {
    const response = await apiClient.get<EpistemicMetrics>('/metrics/epistemic');
    return response.data;
  },

  getCoupling: async (): Promise<CouplingMetrics> => {
    const response = await apiClient.get<CouplingMetrics>('/metrics/coupling');
    return response.data;
  },

  getOrphans: async (): Promise<{ orphanAtoms: AtomSummary[]; orphanTests: TestSummary[] }> => {
    const response = await apiClient.get('/metrics/coupling/orphans');
    return response.data;
  },

  /**
   * Get metrics trends over time
   */
  getTrends: async (period: 'week' | 'month' | 'quarter' = 'month'): Promise<MetricsTrend[]> => {
    const response = await apiClient.get<MetricsTrend[]>('/metrics/trends', { params: { period } });
    return response.data;
  },

  /**
   * Record a metrics snapshot
   */
  recordSnapshot: async (): Promise<void> => {
    await apiClient.post('/metrics/snapshot');
  },
};
