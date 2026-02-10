/**
 * Shared Test Quality Analyzer
 *
 * Pure static analysis functions for evaluating test quality across 7 dimensions.
 * No NestJS, database, or filesystem dependencies — operates solely on source code strings.
 *
 * Used by:
 * - TestQualityService (API endpoint for analyzing Pact's own tests)
 * - TestQualityNode (reconciliation graph node for analyzing target repo tests)
 */

// ============================================================================
// Types
// ============================================================================

export interface QualityDimensionResult {
  name: string;
  score: number;
  threshold: number;
  weight: number;
  passed: boolean;
  issues: QualityIssue[];
}

export interface QualityIssue {
  severity: 'critical' | 'warning' | 'info';
  message: string;
  lineNumber?: number;
  atomId?: string;
  suggestion?: string;
}

export interface TestInfo {
  referencedAtoms: string[];
  orphanTests: Array<{ name: string; lineNumber: number }>;
  totalTests: number;
  annotatedTests: number;
}

export interface TestQualityResult {
  overallScore: number;
  passed: boolean;
  dimensions: Record<string, QualityDimensionResult>;
  testInfo: TestInfo;
}

export interface DimensionConfig {
  weight: number;
  threshold: number;
  name: string;
}

// ============================================================================
// Default dimension configurations
// ============================================================================

export const DEFAULT_DIMENSION_CONFIGS: Record<string, DimensionConfig> = {
  intentFidelity: { weight: 0.2, threshold: 0.7, name: 'Intent Fidelity' },
  noVacuousTests: { weight: 0.15, threshold: 0.9, name: 'No Vacuous Tests' },
  noBrittleTests: { weight: 0.15, threshold: 0.8, name: 'No Brittle Tests' },
  determinism: { weight: 0.1, threshold: 0.95, name: 'Determinism' },
  failureSignalQuality: { weight: 0.15, threshold: 0.7, name: 'Failure Signal Quality' },
  integrationTestAuthenticity: { weight: 0.15, threshold: 0.8, name: 'Integration Test Authenticity' },
  boundaryAndNegativeCoverage: { weight: 0.1, threshold: 0.6, name: 'Boundary & Negative Coverage' },
};

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Analyze test source code for quality across 7 dimensions.
 * Pure function — no side effects, no I/O.
 */
export function analyzeTestQuality(
  sourceCode: string,
  options?: {
    filePath?: string;
    dimensionConfigs?: Record<string, DimensionConfig>;
  },
): TestQualityResult {
  const configs = options?.dimensionConfigs ?? DEFAULT_DIMENSION_CONFIGS;
  const filePath = options?.filePath ?? '';

  const testInfo = extractTestInfo(sourceCode);

  const dimensions: Record<string, QualityDimensionResult> = {
    intentFidelity: evaluateIntentFidelity(
      sourceCode, testInfo.referencedAtoms, testInfo.orphanTests, testInfo.totalTests, configs.intentFidelity,
    ),
    noVacuousTests: evaluateNoVacuousTests(sourceCode, configs.noVacuousTests),
    noBrittleTests: evaluateNoBrittleTests(sourceCode, configs.noBrittleTests),
    determinism: evaluateDeterminism(sourceCode, configs.determinism),
    failureSignalQuality: evaluateFailureSignalQuality(
      sourceCode, testInfo.referencedAtoms, configs.failureSignalQuality,
    ),
    integrationTestAuthenticity: evaluateIntegrationAuthenticity(
      sourceCode, filePath, configs.integrationTestAuthenticity,
    ),
    boundaryAndNegativeCoverage: evaluateBoundaryAndNegativeCoverage(
      sourceCode, configs.boundaryAndNegativeCoverage,
    ),
  };

  const overallScore = calculateOverallScore(dimensions);
  const passed = Object.values(dimensions).every((d) => d.passed);

  return { overallScore, passed, dimensions, testInfo };
}

// ============================================================================
// Test info extraction
// ============================================================================

export function extractTestInfo(content: string): TestInfo {
  const lines = content.split('\n');
  const referencedAtoms = new Set<string>();
  const orphanTests: Array<{ name: string; lineNumber: number }> = [];
  let totalTests = 0;
  let annotatedTests = 0;

  const atomAnnotationRegex = /\/\/\s*@atom\s+(IA-[\w-]+)/g;
  const testRegex = /^\s*(it|test)\s*\(\s*['"`](.+?)['"`]/;

  let lastAnnotationLine = -1;
  let lastAnnotationAtomId: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    const atomMatches = [...line.matchAll(atomAnnotationRegex)];
    if (atomMatches.length > 0) {
      lastAnnotationLine = lineNumber;
      lastAnnotationAtomId = atomMatches[atomMatches.length - 1][1];
      referencedAtoms.add(lastAnnotationAtomId);
    }

    const testMatch = line.match(testRegex);
    if (testMatch) {
      totalTests++;
      const testName = testMatch[2];
      const hasRecentAnnotation = lastAnnotationLine >= lineNumber - 3;

      if (hasRecentAnnotation && lastAnnotationAtomId) {
        annotatedTests++;
      } else {
        orphanTests.push({ name: testName, lineNumber });
      }
    }
  }

  return {
    referencedAtoms: Array.from(referencedAtoms),
    orphanTests,
    totalTests,
    annotatedTests,
  };
}

// ============================================================================
// Dimension evaluators
// ============================================================================

function evaluateIntentFidelity(
  content: string,
  referencedAtoms: string[],
  orphanTests: Array<{ name: string; lineNumber: number }>,
  totalTests: number,
  config: DimensionConfig,
): QualityDimensionResult {
  const issues: QualityIssue[] = [];

  if (totalTests === 0) {
    return { name: config.name, score: 1.0, threshold: config.threshold, weight: config.weight, passed: true, issues: [] };
  }

  const coverage = referencedAtoms.length > 0 ? (totalTests - orphanTests.length) / totalTests : 0;

  orphanTests.forEach((orphan) => {
    issues.push({
      severity: 'warning',
      message: `Test "${orphan.name}" has no @atom annotation`,
      lineNumber: orphan.lineNumber,
      suggestion: 'Add // @atom IA-XXX above the test to link it to an intent atom',
    });
  });

  if (referencedAtoms.length === 0 && totalTests > 0) {
    issues.push({
      severity: 'critical',
      message: 'No intent atoms referenced in this test file',
      suggestion: 'Add @atom annotations to link tests to committed intent atoms',
    });
  }

  return {
    name: config.name, score: coverage, threshold: config.threshold,
    weight: config.weight, passed: coverage >= config.threshold, issues,
  };
}

function evaluateNoVacuousTests(content: string, config: DimensionConfig): QualityDimensionResult {
  const issues: QualityIssue[] = [];

  const vacuousPatterns = [
    { pattern: /expect\([^)]+\)\.toBeDefined\(\)/g, name: 'toBeDefined()' },
    { pattern: /expect\([^)]+\)\.toBeTruthy\(\)/g, name: 'toBeTruthy()' },
    { pattern: /expect\(true\)\.toBe\(true\)/g, name: 'expect(true).toBe(true)' },
    { pattern: /expect\(\)\.pass\(\)/g, name: 'empty pass()' },
  ];

  let vacuousCount = 0;
  const lines = content.split('\n');

  vacuousPatterns.forEach(({ pattern, name }) => {
    const matches = content.match(pattern) || [];
    if (matches.length > 0) {
      vacuousCount += matches.length;
      lines.forEach((line, idx) => {
        if (pattern.test(line)) {
          issues.push({
            severity: 'warning', message: `Vacuous assertion: ${name}`, lineNumber: idx + 1,
            suggestion: 'Replace with meaningful assertion that validates specific behavior',
          });
        }
      });
    }
  });

  const totalAssertions = (content.match(/expect\(/g) || []).length;
  const score = totalAssertions === 0 ? 1.0 : 1.0 - vacuousCount / totalAssertions;

  return {
    name: config.name, score: Math.max(0, score), threshold: config.threshold,
    weight: config.weight, passed: score >= config.threshold, issues,
  };
}

function evaluateNoBrittleTests(content: string, config: DimensionConfig): QualityDimensionResult {
  const issues: QualityIssue[] = [];

  const brittlePatterns = [
    { pattern: /\.toHaveBeenCalledTimes\(/g, name: 'toHaveBeenCalledTimes()' },
    { pattern: /toMatchSnapshot\(\)/g, name: 'snapshot test' },
    { pattern: /setTimeout\(/g, name: 'setTimeout usage' },
    { pattern: /\.only\(/g, name: '.only() - focused test' },
  ];

  let brittleCount = 0;
  const lines = content.split('\n');

  brittlePatterns.forEach(({ pattern, name }) => {
    const matches = content.match(pattern) || [];
    if (matches.length > 0) {
      brittleCount += matches.length;
      lines.forEach((line, idx) => {
        if (pattern.test(line)) {
          issues.push({
            severity: 'warning', message: `Potentially brittle: ${name}`, lineNumber: idx + 1,
            suggestion: 'Consider if this assertion couples to implementation details',
          });
        }
      });
    }
  });

  const totalTests = (content.match(/it\(/g) || []).length;
  const score = totalTests === 0 ? 1.0 : Math.max(0, 1.0 - (brittleCount / totalTests) * 0.5);

  return {
    name: config.name, score, threshold: config.threshold,
    weight: config.weight, passed: score >= config.threshold, issues,
  };
}

function evaluateDeterminism(content: string, config: DimensionConfig): QualityDimensionResult {
  const issues: QualityIssue[] = [];

  const nonDeterministicPatterns = [
    { pattern: /Math\.random\(\)/g, name: 'Math.random()' },
    { pattern: /Date\.now\(\)/g, name: 'Date.now()' },
    { pattern: /new Date\(\)/g, name: 'new Date()' },
  ];

  const isMocked = content.includes('jest.mock') || content.includes('jest.spyOn')
    || content.includes('vi.mock') || content.includes('vi.spyOn');

  let issueCount = 0;
  const lines = content.split('\n');

  if (!isMocked) {
    nonDeterministicPatterns.forEach(({ pattern, name }) => {
      const matches = content.match(pattern) || [];
      if (matches.length > 0) {
        issueCount += matches.length;
        lines.forEach((line, idx) => {
          if (pattern.test(line)) {
            issues.push({
              severity: 'warning', message: `Non-deterministic: ${name} without mocking`,
              lineNumber: idx + 1,
              suggestion: 'Mock this value or use a seeded approach for reproducibility',
            });
          }
        });
      }
    });
  }

  const score = issueCount === 0 ? 1.0 : Math.max(0, 1.0 - issueCount * 0.1);

  return {
    name: config.name, score, threshold: config.threshold,
    weight: config.weight, passed: score >= config.threshold, issues,
  };
}

function evaluateFailureSignalQuality(
  content: string,
  referencedAtoms: string[],
  config: DimensionConfig,
): QualityDimensionResult {
  const issues: QualityIssue[] = [];

  const assertionsWithComments = (content.match(/\/\/[^\n]+\n\s*expect\(/g) || []).length;
  const totalAssertions = (content.match(/expect\(/g) || []).length;

  if (totalAssertions === 0) {
    return { name: config.name, score: 1.0, threshold: config.threshold, weight: config.weight, passed: true, issues: [] };
  }

  const score = Math.min(assertionsWithComments / totalAssertions, 1.0);

  if (score < config.threshold) {
    issues.push({
      severity: 'info',
      message: `Only ${(score * 100).toFixed(0)}% of assertions have explanatory comments`,
      suggestion: 'Add comments before expect() statements explaining what behavior is being validated',
    });
  }

  if (referencedAtoms.length > 0) {
    issues.push({ severity: 'info', message: `References atoms: ${referencedAtoms.join(', ')}` });
  }

  return {
    name: config.name, score, threshold: config.threshold,
    weight: config.weight, passed: score >= config.threshold, issues,
  };
}

function evaluateIntegrationAuthenticity(
  content: string,
  filePath: string,
  config: DimensionConfig,
): QualityDimensionResult {
  const issues: QualityIssue[] = [];

  const isIntegrationTest = filePath.includes('integration') || filePath.includes('e2e');

  if (!isIntegrationTest) {
    return { name: config.name, score: 1.0, threshold: config.threshold, weight: config.weight, passed: true, issues: [] };
  }

  const mockPatterns = [
    { pattern: /jest\.mock\(/g, name: 'jest.mock()' },
    { pattern: /\.mockImplementation\(/g, name: '.mockImplementation()' },
    { pattern: /\.mockReturnValue\(/g, name: '.mockReturnValue()' },
    { pattern: /vi\.mock\(/g, name: 'vi.mock()' },
  ];

  let mockCount = 0;
  const lines = content.split('\n');

  mockPatterns.forEach(({ pattern, name }) => {
    const matches = content.match(pattern) || [];
    if (matches.length > 0) {
      mockCount += matches.length;
      lines.forEach((line, idx) => {
        if (pattern.test(line)) {
          issues.push({
            severity: 'warning', message: `Integration test uses ${name}`, lineNumber: idx + 1,
            suggestion: 'Integration tests should use real implementations; use Docker services instead of mocks',
          });
        }
      });
    }
  });

  const score = mockCount === 0 ? 1.0 : Math.max(0, 1.0 - mockCount * 0.2);

  return {
    name: config.name, score, threshold: config.threshold,
    weight: config.weight, passed: score >= config.threshold, issues,
  };
}

function evaluateBoundaryAndNegativeCoverage(
  content: string,
  config: DimensionConfig,
): QualityDimensionResult {
  const issues: QualityIssue[] = [];

  const boundaryPatterns = [
    /toBe\(0\)/g, /toBe\(null\)/g, /toBe\(undefined\)/g,
    /toBeGreaterThan\(/g, /toBeLessThan\(/g, /toThrow/g,
    /expect.*\.rejects/g, /toBeNull\(\)/g, /toBeUndefined\(\)/g, /toHaveLength\(0\)/g,
  ];

  let boundaryTestCount = 0;
  boundaryPatterns.forEach((pattern) => {
    boundaryTestCount += (content.match(pattern) || []).length;
  });

  const totalTests = (content.match(/it\(/g) || []).length;

  if (totalTests === 0) {
    return { name: config.name, score: 1.0, threshold: config.threshold, weight: config.weight, passed: true, issues: [] };
  }

  const ratio = boundaryTestCount / totalTests;
  const score = Math.min(ratio / 0.3, 1.0);

  if (score < config.threshold) {
    issues.push({
      severity: 'info',
      message: `Boundary/negative test coverage: ${(ratio * 100).toFixed(0)}%`,
      suggestion: 'Add tests for edge cases: null values, empty arrays, error conditions, boundaries',
    });
  }

  return {
    name: config.name, score, threshold: config.threshold,
    weight: config.weight, passed: score >= config.threshold, issues,
  };
}

// ============================================================================
// Score calculation
// ============================================================================

export function calculateOverallScore(dimensions: Record<string, QualityDimensionResult>): number {
  let weightedSum = 0;
  let totalWeight = 0;

  Object.values(dimensions).forEach((dimension) => {
    weightedSum += dimension.score * dimension.weight;
    totalWeight += dimension.weight;
  });

  return totalWeight === 0 ? 0 : (weightedSum / totalWeight) * 100;
}
