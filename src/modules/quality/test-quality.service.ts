import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'node:child_process';
import { TestQualitySnapshot } from './test-quality-snapshot.entity';
import {
  QualityProfile,
  DEFAULT_QUALITY_DIMENSIONS,
  QualityDimensionConfig,
} from './quality-profile.entity';
import {
  computeQualityGrade,
  QualityDimensionScore,
  QualityGrade,
} from '../agents/entities/test-record.entity';
import { TestQualityResultDto, TestQualityBatchResultDto } from './dto/analyze-test.dto';
import { QualityProfileResponseDto } from './dto/quality-profile.dto';

export interface QualityDimension {
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

export interface TestFileQualityResult {
  filePath: string;
  relativePath: string;
  overallScore: number;
  passed: boolean;
  dimensions: Record<string, QualityDimension>;
  referencedAtoms: string[];
  orphanTests: Array<{ name: string; lineNumber: number }>;
  totalTests: number;
  annotatedTests: number;
}

export interface QualityAnalysisResult {
  timestamp: Date;
  commitHash?: string;
  branchName?: string;
  summary: {
    totalFiles: number;
    passedFiles: number;
    failedFiles: number;
    overallScore: number;
    totalTests: number;
    annotatedTests: number;
    orphanTests: number;
  };
  dimensionAverages: Record<string, number>;
  fileResults: TestFileQualityResult[];
  trends?: QualityTrend[];
}

export interface QualityTrend {
  date: Date;
  overallScore: number;
  passedFiles: number;
  totalFiles: number;
}

export interface QualityCheckOptions {
  testDirectory?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  saveSnapshot?: boolean;
}

// Quality dimensions with weights and thresholds
const QUALITY_DIMENSIONS = {
  intentFidelity: { weight: 0.2, threshold: 0.7, name: 'Intent Fidelity' },
  noVacuousTests: { weight: 0.15, threshold: 0.9, name: 'No Vacuous Tests' },
  noBrittleTests: { weight: 0.15, threshold: 0.8, name: 'No Brittle Tests' },
  determinism: { weight: 0.1, threshold: 0.95, name: 'Determinism' },
  failureSignalQuality: { weight: 0.15, threshold: 0.7, name: 'Failure Signal Quality' },
  integrationTestAuthenticity: {
    weight: 0.15,
    threshold: 0.8,
    name: 'Integration Test Authenticity',
  },
  boundaryAndNegativeCoverage: {
    weight: 0.1,
    threshold: 0.6,
    name: 'Boundary & Negative Coverage',
  },
};

@Injectable()
export class TestQualityService {
  private readonly logger = new Logger(TestQualityService.name);
  private readonly defaultTestPatterns = ['**/*.spec.ts', '**/*.test.ts'];
  private readonly defaultExcludePatterns = ['**/node_modules/**', '**/dist/**'];

  constructor(
    @InjectRepository(TestQualitySnapshot)
    private snapshotRepository: Repository<TestQualitySnapshot>,
    @InjectRepository(QualityProfile)
    private readonly profileRepository: Repository<QualityProfile>,
  ) {}

  /**
   * Analyze test quality across the codebase
   */
  async analyzeQuality(options: QualityCheckOptions = {}): Promise<QualityAnalysisResult> {
    const testDirectory = options.testDirectory || path.join(process.cwd(), 'src');
    const saveSnapshot = options.saveSnapshot ?? false;

    this.logger.log(`Analyzing test quality in: ${testDirectory}`);

    // Find all test files
    const testFiles = this.findTestFiles(testDirectory, options);
    this.logger.log(`Found ${testFiles.length} test files`);

    // Analyze each file
    const fileResults: TestFileQualityResult[] = [];
    for (const filePath of testFiles) {
      const result = this.analyzeTestFile(filePath, testDirectory);
      fileResults.push(result);
    }

    // Calculate summary
    const summary = this.calculateSummary(fileResults);
    const dimensionAverages = this.calculateDimensionAverages(fileResults);

    // Get git info if available
    const { commitHash, branchName } = this.getGitInfo();

    // Get trends
    const trends = await this.getRecentTrends(7);

    const result: QualityAnalysisResult = {
      timestamp: new Date(),
      commitHash,
      branchName,
      summary,
      dimensionAverages,
      fileResults,
      trends,
    };

    // Save snapshot if requested
    if (saveSnapshot) {
      await this.saveSnapshot(result);
    }

    return result;
  }

  /**
   * Analyze a single test file
   */
  analyzeTestFile(filePath: string, baseDir: string = process.cwd()): TestFileQualityResult {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(baseDir, filePath);

    // Extract atom annotations and test info
    const { referencedAtoms, orphanTests, totalTests, annotatedTests } =
      this.extractTestInfo(content);

    // Evaluate each dimension
    const dimensions: Record<string, QualityDimension> = {};

    dimensions.intentFidelity = this.evaluateIntentFidelity(
      content,
      referencedAtoms,
      orphanTests,
      totalTests,
    );
    dimensions.noVacuousTests = this.evaluateNoVacuousTests(content);
    dimensions.noBrittleTests = this.evaluateNoBrittleTests(content);
    dimensions.determinism = this.evaluateDeterminism(content);
    dimensions.failureSignalQuality = this.evaluateFailureSignalQuality(content, referencedAtoms);
    dimensions.integrationTestAuthenticity = this.evaluateIntegrationAuthenticity(
      content,
      filePath,
    );
    dimensions.boundaryAndNegativeCoverage = this.evaluateBoundaryAndNegativeCoverage(content);

    // Calculate overall score
    const overallScore = this.calculateOverallScore(dimensions);
    const passed = Object.values(dimensions).every((d) => d.passed);

    return {
      filePath,
      relativePath,
      overallScore,
      passed,
      dimensions,
      referencedAtoms,
      orphanTests,
      totalTests,
      annotatedTests,
    };
  }

  /**
   * Extract test information including atom references
   */
  private extractTestInfo(content: string): {
    referencedAtoms: string[];
    orphanTests: Array<{ name: string; lineNumber: number }>;
    totalTests: number;
    annotatedTests: number;
  } {
    const lines = content.split('\n');
    const referencedAtoms = new Set<string>();
    const orphanTests: Array<{ name: string; lineNumber: number }> = [];
    let totalTests = 0;
    let annotatedTests = 0;

    const atomAnnotationRegex = /\/\/\s*@atom\s+(IA-\d+)/g;
    const testRegex = /^\s*(it|test)\s*\(\s*['"`](.+?)['"`]/;

    let lastAnnotationLine = -1;
    let lastAnnotationAtomId: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check for @atom annotations
      const atomMatches = [...line.matchAll(atomAnnotationRegex)];
      if (atomMatches.length > 0) {
        lastAnnotationLine = lineNumber;
        lastAnnotationAtomId = atomMatches[atomMatches.length - 1][1];
        referencedAtoms.add(lastAnnotationAtomId);
      }

      // Check for test declarations
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

  /**
   * Evaluate Intent Fidelity dimension
   */
  private evaluateIntentFidelity(
    content: string,
    referencedAtoms: string[],
    orphanTests: Array<{ name: string; lineNumber: number }>,
    totalTests: number,
  ): QualityDimension {
    const config = QUALITY_DIMENSIONS.intentFidelity;
    const issues: QualityIssue[] = [];

    if (totalTests === 0) {
      return {
        name: config.name,
        score: 1.0,
        threshold: config.threshold,
        weight: config.weight,
        passed: true,
        issues: [],
      };
    }

    const coverage =
      referencedAtoms.length > 0 ? (totalTests - orphanTests.length) / totalTests : 0;

    // Add issues for orphan tests
    orphanTests.forEach((orphan) => {
      issues.push({
        severity: 'warning',
        message: `Test "${orphan.name}" has no @atom annotation`,
        lineNumber: orphan.lineNumber,
        suggestion: `Add // @atom IA-XXX above the test to link it to an intent atom`,
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
      name: config.name,
      score: coverage,
      threshold: config.threshold,
      weight: config.weight,
      passed: coverage >= config.threshold,
      issues,
    };
  }

  /**
   * Evaluate No Vacuous Tests dimension
   */
  private evaluateNoVacuousTests(content: string): QualityDimension {
    const config = QUALITY_DIMENSIONS.noVacuousTests;
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
        // Find line numbers
        lines.forEach((line, idx) => {
          if (pattern.test(line)) {
            issues.push({
              severity: 'warning',
              message: `Vacuous assertion: ${name}`,
              lineNumber: idx + 1,
              suggestion: 'Replace with meaningful assertion that validates specific behavior',
            });
          }
        });
      }
    });

    const totalAssertions = (content.match(/expect\(/g) || []).length;
    const score = totalAssertions === 0 ? 1.0 : 1.0 - vacuousCount / totalAssertions;

    return {
      name: config.name,
      score: Math.max(0, score),
      threshold: config.threshold,
      weight: config.weight,
      passed: score >= config.threshold,
      issues,
    };
  }

  /**
   * Evaluate No Brittle Tests dimension
   */
  private evaluateNoBrittleTests(content: string): QualityDimension {
    const config = QUALITY_DIMENSIONS.noBrittleTests;
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
              severity: 'warning',
              message: `Potentially brittle: ${name}`,
              lineNumber: idx + 1,
              suggestion: 'Consider if this assertion couples to implementation details',
            });
          }
        });
      }
    });

    const totalTests = (content.match(/it\(/g) || []).length;
    const score = totalTests === 0 ? 1.0 : Math.max(0, 1.0 - (brittleCount / totalTests) * 0.5);

    return {
      name: config.name,
      score,
      threshold: config.threshold,
      weight: config.weight,
      passed: score >= config.threshold,
      issues,
    };
  }

  /**
   * Evaluate Determinism dimension
   */
  private evaluateDeterminism(content: string): QualityDimension {
    const config = QUALITY_DIMENSIONS.determinism;
    const issues: QualityIssue[] = [];

    const nonDeterministicPatterns = [
      { pattern: /Math\.random\(\)/g, name: 'Math.random()' },
      { pattern: /Date\.now\(\)/g, name: 'Date.now()' },
      { pattern: /new Date\(\)/g, name: 'new Date()' },
    ];

    const isMocked = content.includes('jest.mock') || content.includes('jest.spyOn');
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
                severity: 'warning',
                message: `Non-deterministic: ${name} without mocking`,
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
      name: config.name,
      score,
      threshold: config.threshold,
      weight: config.weight,
      passed: score >= config.threshold,
      issues,
    };
  }

  /**
   * Evaluate Failure Signal Quality dimension
   */
  private evaluateFailureSignalQuality(
    content: string,
    referencedAtoms: string[],
  ): QualityDimension {
    const config = QUALITY_DIMENSIONS.failureSignalQuality;
    const issues: QualityIssue[] = [];

    // Count assertions with comments/documentation
    const assertionsWithComments = (content.match(/\/\/[^\n]+\n\s*expect\(/g) || []).length;
    const totalAssertions = (content.match(/expect\(/g) || []).length;

    if (totalAssertions === 0) {
      return {
        name: config.name,
        score: 1.0,
        threshold: config.threshold,
        weight: config.weight,
        passed: true,
        issues: [],
      };
    }

    const documented = assertionsWithComments;
    const score = Math.min(documented / totalAssertions, 1.0);

    if (score < config.threshold) {
      issues.push({
        severity: 'info',
        message: `Only ${(score * 100).toFixed(0)}% of assertions have explanatory comments`,
        suggestion:
          'Add comments before expect() statements explaining what behavior is being validated',
      });
    }

    // Bonus for referencing atoms in test names/descriptions
    if (referencedAtoms.length > 0) {
      issues.push({
        severity: 'info',
        message: `References atoms: ${referencedAtoms.join(', ')}`,
      });
    }

    return {
      name: config.name,
      score,
      threshold: config.threshold,
      weight: config.weight,
      passed: score >= config.threshold,
      issues,
    };
  }

  /**
   * Evaluate Integration Test Authenticity dimension
   */
  private evaluateIntegrationAuthenticity(content: string, filePath: string): QualityDimension {
    const config = QUALITY_DIMENSIONS.integrationTestAuthenticity;
    const issues: QualityIssue[] = [];

    const isIntegrationTest = filePath.includes('integration') || filePath.includes('e2e');

    if (!isIntegrationTest) {
      return {
        name: config.name,
        score: 1.0,
        threshold: config.threshold,
        weight: config.weight,
        passed: true,
        issues: [],
      };
    }

    const mockPatterns = [
      { pattern: /jest\.mock\(/g, name: 'jest.mock()' },
      { pattern: /\.mockImplementation\(/g, name: '.mockImplementation()' },
      { pattern: /\.mockReturnValue\(/g, name: '.mockReturnValue()' },
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
              severity: 'warning',
              message: `Integration test uses ${name}`,
              lineNumber: idx + 1,
              suggestion:
                'Integration tests should use real implementations; use Docker services instead of mocks',
            });
          }
        });
      }
    });

    const score = mockCount === 0 ? 1.0 : Math.max(0, 1.0 - mockCount * 0.2);

    return {
      name: config.name,
      score,
      threshold: config.threshold,
      weight: config.weight,
      passed: score >= config.threshold,
      issues,
    };
  }

  /**
   * Evaluate Boundary and Negative Coverage dimension
   */
  private evaluateBoundaryAndNegativeCoverage(content: string): QualityDimension {
    const config = QUALITY_DIMENSIONS.boundaryAndNegativeCoverage;
    const issues: QualityIssue[] = [];

    const boundaryPatterns = [
      /toBe\(0\)/g,
      /toBe\(null\)/g,
      /toBe\(undefined\)/g,
      /toBeGreaterThan\(/g,
      /toBeLessThan\(/g,
      /toThrow/g,
      /expect.*\.rejects/g,
      /toBeNull\(\)/g,
      /toBeUndefined\(\)/g,
      /toHaveLength\(0\)/g,
    ];

    let boundaryTestCount = 0;
    boundaryPatterns.forEach((pattern) => {
      boundaryTestCount += (content.match(pattern) || []).length;
    });

    const totalTests = (content.match(/it\(/g) || []).length;

    if (totalTests === 0) {
      return {
        name: config.name,
        score: 1.0,
        threshold: config.threshold,
        weight: config.weight,
        passed: true,
        issues: [],
      };
    }

    const ratio = boundaryTestCount / totalTests;
    const score = Math.min(ratio / 0.3, 1.0);

    if (score < config.threshold) {
      issues.push({
        severity: 'info',
        message: `Boundary/negative test coverage: ${(ratio * 100).toFixed(0)}%`,
        suggestion:
          'Add tests for edge cases: null values, empty arrays, error conditions, boundaries',
      });
    }

    return {
      name: config.name,
      score,
      threshold: config.threshold,
      weight: config.weight,
      passed: score >= config.threshold,
      issues,
    };
  }

  /**
   * Calculate overall score from dimensions
   */
  private calculateOverallScore(dimensions: Record<string, QualityDimension>): number {
    let weightedSum = 0;
    let totalWeight = 0;

    Object.values(dimensions).forEach((dimension) => {
      weightedSum += dimension.score * dimension.weight;
      totalWeight += dimension.weight;
    });

    return (weightedSum / totalWeight) * 100;
  }

  /**
   * Calculate summary from file results
   */
  private calculateSummary(fileResults: TestFileQualityResult[]): QualityAnalysisResult['summary'] {
    const passedFiles = fileResults.filter((r) => r.passed).length;
    const failedFiles = fileResults.length - passedFiles;
    const overallScore =
      fileResults.length > 0
        ? fileResults.reduce((sum, r) => sum + r.overallScore, 0) / fileResults.length
        : 100;
    const totalTests = fileResults.reduce((sum, r) => sum + r.totalTests, 0);
    const annotatedTests = fileResults.reduce((sum, r) => sum + r.annotatedTests, 0);
    const orphanTests = fileResults.reduce((sum, r) => sum + r.orphanTests.length, 0);

    return {
      totalFiles: fileResults.length,
      passedFiles,
      failedFiles,
      overallScore,
      totalTests,
      annotatedTests,
      orphanTests,
    };
  }

  /**
   * Calculate dimension averages across all files
   */
  private calculateDimensionAverages(fileResults: TestFileQualityResult[]): Record<string, number> {
    if (fileResults.length === 0) return {};

    const averages: Record<string, number> = {};
    const dimensionKeys = Object.keys(QUALITY_DIMENSIONS);

    dimensionKeys.forEach((key) => {
      const sum = fileResults.reduce((acc, r) => acc + (r.dimensions[key]?.score || 0), 0);
      averages[key] = (sum / fileResults.length) * 100;
    });

    return averages;
  }

  /**
   * Find test files in directory
   */
  private findTestFiles(directory: string, options: QualityCheckOptions): string[] {
    const includePatterns = options.includePatterns || this.defaultTestPatterns;
    const excludePatterns = options.excludePatterns || this.defaultExcludePatterns;
    const testFiles: string[] = [];

    const walkDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(directory, fullPath);

        if (this.matchesPatterns(relativePath, excludePatterns)) continue;

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile()) {
          if (
            this.matchesPatterns(relativePath, includePatterns) ||
            this.matchesPatterns(entry.name, includePatterns)
          ) {
            testFiles.push(fullPath);
          }
        }
      }
    };

    walkDir(directory);
    return testFiles;
  }

  /**
   * Check if path matches any glob patterns
   */
  private matchesPatterns(filePath: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (this.matchGlob(filePath, pattern)) return true;
    }
    return false;
  }

  /**
   * Simple glob matching
   */
  private matchGlob(filePath: string, pattern: string): boolean {
    let regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<GLOBSTAR>>>/g, '.*');

    if (regexPattern.startsWith('.*/')) {
      regexPattern = `(${regexPattern}|${regexPattern.slice(3)})`;
    }

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  /**
   * Get git information
   */
  private getGitInfo(): { commitHash?: string; branchName?: string } {
    try {
      const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
      const branchName = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
      return { commitHash, branchName };
    } catch {
      return {};
    }
  }

  /**
   * Save quality snapshot to database
   */
  async saveSnapshot(result: QualityAnalysisResult): Promise<TestQualitySnapshot> {
    const snapshot = this.snapshotRepository.create({
      commitHash: result.commitHash,
      branchName: result.branchName,
      totalFiles: result.summary.totalFiles,
      passedFiles: result.summary.passedFiles,
      failedFiles: result.summary.failedFiles,
      overallScore: result.summary.overallScore,
      intentFidelityScore: result.dimensionAverages.intentFidelity || 0,
      noVacuousTestsScore: result.dimensionAverages.noVacuousTests || 0,
      noBrittleTestsScore: result.dimensionAverages.noBrittleTests || 0,
      determinismScore: result.dimensionAverages.determinism || 0,
      failureSignalQualityScore: result.dimensionAverages.failureSignalQuality || 0,
      integrationAuthenticityScore: result.dimensionAverages.integrationTestAuthenticity || 0,
      boundaryCoverageScore: result.dimensionAverages.boundaryAndNegativeCoverage || 0,
      totalTests: result.summary.totalTests,
      annotatedTests: result.summary.annotatedTests,
      orphanTests: result.summary.orphanTests,
      details: {
        fileResults: result.fileResults.map((r) => ({
          relativePath: r.relativePath,
          overallScore: r.overallScore,
          passed: r.passed,
        })),
      },
    });

    return this.snapshotRepository.save(snapshot);
  }

  /**
   * Get recent quality trends
   */
  async getRecentTrends(days: number = 7): Promise<QualityTrend[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const snapshots = await this.snapshotRepository.find({
      where: {},
      order: { createdAt: 'ASC' },
      take: 30,
    });

    return snapshots.map((s) => ({
      date: s.createdAt,
      overallScore: Number(s.overallScore),
      passedFiles: s.passedFiles,
      totalFiles: s.totalFiles,
    }));
  }

  /**
   * Generate HTML report
   */
  generateHtmlReport(result: QualityAnalysisResult): string {
    const escapeHtml = (str: string) =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const getScoreColor = (score: number) => {
      if (score >= 80) return '#22c55e';
      if (score >= 60) return '#eab308';
      return '#ef4444';
    };

    const getSeverityIcon = (severity: string) => {
      switch (severity) {
        case 'critical':
          return '🔴';
        case 'warning':
          return '🟡';
        default:
          return '🔵';
      }
    };

    const dimensionRows = Object.entries(result.dimensionAverages)
      .map(([key, value]) => {
        const config = QUALITY_DIMENSIONS[key as keyof typeof QUALITY_DIMENSIONS];
        const passed = value >= config.threshold * 100;
        return `
          <tr>
            <td>${config.name}</td>
            <td style="color: ${getScoreColor(value)}">${value.toFixed(1)}%</td>
            <td>${(config.threshold * 100).toFixed(0)}%</td>
            <td>${passed ? '✅' : '❌'}</td>
          </tr>
        `;
      })
      .join('');

    const fileRows = result.fileResults
      .map((file) => {
        const issues = Object.values(file.dimensions)
          .flatMap((d) => d.issues)
          .slice(0, 5);
        const issueHtml =
          issues.length > 0
            ? `<ul class="issues">${issues
                .map(
                  (i) =>
                    `<li>${getSeverityIcon(i.severity)} ${escapeHtml(i.message)}${i.lineNumber ? ` (line ${i.lineNumber})` : ''}</li>`,
                )
                .join('')}</ul>`
            : '<span class="no-issues">No issues</span>';

        return `
          <tr class="${file.passed ? 'passed' : 'failed'}">
            <td>${escapeHtml(file.relativePath)}</td>
            <td style="color: ${getScoreColor(file.overallScore)}">${file.overallScore.toFixed(1)}%</td>
            <td>${file.totalTests}</td>
            <td>${file.annotatedTests}</td>
            <td>${file.orphanTests.length}</td>
            <td>${file.passed ? '✅' : '❌'}</td>
          </tr>
          <tr class="issues-row">
            <td colspan="6">${issueHtml}</td>
          </tr>
        `;
      })
      .join('');

    const trendData = result.trends || [];
    const trendPoints =
      trendData.length > 0
        ? trendData.map((t, i) => `${i * 40},${100 - t.overallScore}`).join(' ')
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Quality Report - ${result.timestamp.toISOString().split('T')[0]}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0; padding: 20px; background: #1a1a2e; color: #eee;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #fff; border-bottom: 2px solid #4f46e5; padding-bottom: 10px; }
    h2 { color: #a5b4fc; margin-top: 30px; }
    .summary {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px; margin: 20px 0;
    }
    .stat {
      background: #16213e; padding: 20px; border-radius: 8px;
      text-align: center; border: 1px solid #0f3460;
    }
    .stat-value { font-size: 2em; font-weight: bold; }
    .stat-label { color: #94a3b8; font-size: 0.9em; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
    th { background: #1e293b; color: #94a3b8; }
    tr:hover { background: #1e293b; }
    tr.passed { }
    tr.failed td:first-child { border-left: 3px solid #ef4444; }
    .issues-row { background: #16213e; }
    .issues-row td { padding: 8px 12px; font-size: 0.9em; }
    .issues { margin: 0; padding-left: 20px; }
    .issues li { margin: 4px 0; }
    .no-issues { color: #22c55e; }
    .trend-chart {
      background: #16213e; padding: 20px; border-radius: 8px;
      margin: 20px 0; border: 1px solid #0f3460;
    }
    .atoms { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
    .atom {
      background: #4f46e5; color: white; padding: 4px 10px;
      border-radius: 4px; font-size: 0.85em;
    }
    footer {
      margin-top: 40px; padding-top: 20px; border-top: 1px solid #334155;
      color: #64748b; font-size: 0.85em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Test Quality Report</h1>
    <p>Generated: ${result.timestamp.toLocaleString()}</p>
    ${result.commitHash ? `<p>Commit: <code>${result.commitHash.slice(0, 8)}</code> (${result.branchName})</p>` : ''}

    <div class="summary">
      <div class="stat">
        <div class="stat-value" style="color: ${getScoreColor(result.summary.overallScore)}">
          ${result.summary.overallScore.toFixed(1)}%
        </div>
        <div class="stat-label">Overall Score</div>
      </div>
      <div class="stat">
        <div class="stat-value">${result.summary.totalFiles}</div>
        <div class="stat-label">Total Files</div>
      </div>
      <div class="stat">
        <div class="stat-value" style="color: #22c55e">${result.summary.passedFiles}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat">
        <div class="stat-value" style="color: ${result.summary.failedFiles > 0 ? '#ef4444' : '#22c55e'}">
          ${result.summary.failedFiles}
        </div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat">
        <div class="stat-value">${result.summary.totalTests}</div>
        <div class="stat-label">Total Tests</div>
      </div>
      <div class="stat">
        <div class="stat-value">${result.summary.annotatedTests}</div>
        <div class="stat-label">Annotated</div>
      </div>
    </div>

    <h2>Quality Dimensions</h2>
    <table>
      <thead>
        <tr><th>Dimension</th><th>Score</th><th>Threshold</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${dimensionRows}
      </tbody>
    </table>

    ${
      trendData.length > 0
        ? `
    <h2>Quality Trend (Last 7 Days)</h2>
    <div class="trend-chart">
      <svg width="100%" height="100" viewBox="0 0 ${trendData.length * 40} 100" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke="#4f46e5"
          stroke-width="2"
          points="${trendPoints}"
        />
      </svg>
    </div>
    `
        : ''
    }

    <h2>File Details</h2>
    <table>
      <thead>
        <tr>
          <th>File</th><th>Score</th><th>Tests</th><th>Annotated</th><th>Orphans</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${fileRows}
      </tbody>
    </table>

    <footer>
      <p>Generated by Pact Test Quality Analyzer</p>
      <p>7 quality dimensions: Intent Fidelity, No Vacuous Tests, No Brittle Tests,
         Determinism, Failure Signal Quality, Integration Authenticity, Boundary Coverage</p>
    </footer>
  </div>
</body>
</html>`;
  }

  /**
   * Check quality gate and throw if failed
   */
  async checkQualityGate(options: QualityCheckOptions = {}): Promise<void> {
    const result = await this.analyzeQuality(options);

    if (result.summary.failedFiles > 0) {
      this.logger.error(
        `Test quality gate FAILED: ${result.summary.failedFiles} files below threshold`,
      );
      throw new Error(
        `Test quality gate failed:\n` +
          `Overall Score: ${result.summary.overallScore.toFixed(1)}%\n` +
          `Passed: ${result.summary.passedFiles}/${result.summary.totalFiles} files\n` +
          `Failed files:\n${result.fileResults
            .filter((r) => !r.passed)
            .map((r) => `  - ${r.relativePath}: ${r.overallScore.toFixed(1)}%`)
            .join('\n')}`,
      );
    }

    this.logger.log('Test quality gate PASSED');
  }

  // ==========================================================================
  // Phase 14B: Text-Based Analysis (Ingestion Boundary Pattern)
  // ==========================================================================

  /**
   * Analyze test quality from source code text (no filesystem access).
   *
   * This is the Ingestion Boundary version of analyzeTestFile:
   * accepts source code as a string instead of reading from disk.
   */
  analyzeTestSource(
    sourceCode: string,
    options?: { filePath?: string; profileId?: string },
  ): TestQualityResultDto {
    const filePath = options?.filePath || 'unknown.spec.ts';

    // Extract atom annotations and test info
    const { referencedAtoms, orphanTests, totalTests, annotatedTests } =
      this.extractTestInfo(sourceCode);

    // Evaluate each dimension
    const rawDimensions: Record<string, QualityDimension> = {};

    rawDimensions.intentFidelity = this.evaluateIntentFidelity(
      sourceCode,
      referencedAtoms,
      orphanTests,
      totalTests,
    );
    rawDimensions.noVacuousTests = this.evaluateNoVacuousTests(sourceCode);
    rawDimensions.noBrittleTests = this.evaluateNoBrittleTests(sourceCode);
    rawDimensions.determinism = this.evaluateDeterminism(sourceCode);
    rawDimensions.failureSignalQuality = this.evaluateFailureSignalQuality(
      sourceCode,
      referencedAtoms,
    );
    rawDimensions.integrationTestAuthenticity = this.evaluateIntegrationAuthenticity(
      sourceCode,
      filePath,
    );
    rawDimensions.boundaryAndNegativeCoverage =
      this.evaluateBoundaryAndNegativeCoverage(sourceCode);

    // Calculate overall score
    const overallScore = this.calculateOverallScore(rawDimensions);
    const passed = Object.values(rawDimensions).every((d) => d.passed);
    const grade = computeQualityGrade(overallScore);

    // Convert to QualityDimensionScore format for TestRecord storage
    const dimensions: Record<string, QualityDimensionScore> = {};
    for (const [key, dim] of Object.entries(rawDimensions)) {
      dimensions[key] = {
        score: dim.score,
        passed: dim.passed,
        issues: dim.issues.map((i) => ({
          severity: i.severity,
          message: i.message,
          lineNumber: i.lineNumber,
          suggestion: i.suggestion,
        })),
      };
    }

    return {
      overallScore,
      grade,
      passed,
      dimensions,
      totalTests,
      annotatedTests,
      referencedAtoms,
    };
  }

  /**
   * Batch analyze multiple test sources.
   */
  analyzeTestSourceBatch(
    tests: Array<{
      sourceCode: string;
      filePath?: string;
      testRecordId?: string;
    }>,
    options?: { profileId?: string },
  ): TestQualityBatchResultDto {
    const results: TestQualityBatchResultDto['results'] = [];
    const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    let totalScore = 0;

    for (const test of tests) {
      const result = this.analyzeTestSource(test.sourceCode, {
        filePath: test.filePath,
        profileId: options?.profileId,
      });

      results.push({ ...result, testRecordId: test.testRecordId });
      totalScore += result.overallScore;
      gradeDistribution[result.grade] = (gradeDistribution[result.grade] || 0) + 1;
    }

    return {
      results,
      summary: {
        totalAnalyzed: tests.length,
        averageScore: tests.length > 0 ? totalScore / tests.length : 0,
        gradeDistribution,
      },
    };
  }

  // ==========================================================================
  // Phase 14B: Quality Profile CRUD
  // ==========================================================================

  /**
   * List quality profiles, optionally filtered by project.
   */
  async listProfiles(projectId?: string): Promise<QualityProfileResponseDto[]> {
    const where: Record<string, unknown> = {};
    if (projectId) {
      where.projectId = projectId;
    }

    const profiles = await this.profileRepository.find({
      where,
      order: { isDefault: 'DESC', name: 'ASC' },
    });

    return profiles.map((p) => this.toProfileResponse(p));
  }

  /**
   * Get a specific quality profile by ID.
   */
  async getProfile(id: string): Promise<QualityProfile | null> {
    return this.profileRepository.findOne({ where: { id } });
  }

  /**
   * Get the default profile (or system default if none set).
   */
  async getDefaultProfile(projectId?: string): Promise<QualityDimensionConfig[]> {
    const where: Record<string, unknown> = { isDefault: true };
    if (projectId) {
      where.projectId = projectId;
    }

    const profile = await this.profileRepository.findOne({ where });
    return profile?.dimensions || DEFAULT_QUALITY_DIMENSIONS;
  }

  /**
   * Create a new quality profile.
   */
  async createProfile(params: {
    name: string;
    description?: string;
    projectId?: string;
    dimensions: QualityDimensionConfig[];
    isDefault?: boolean;
  }): Promise<QualityProfile> {
    // If setting as default, unset other defaults for this project
    if (params.isDefault) {
      await this.unsetDefaultProfiles(params.projectId || null);
    }

    const profile = this.profileRepository.create({
      name: params.name,
      description: params.description || null,
      projectId: params.projectId || null,
      dimensions: params.dimensions,
      isDefault: params.isDefault || false,
    });

    return this.profileRepository.save(profile);
  }

  /**
   * Update a quality profile.
   */
  async updateProfile(
    id: string,
    params: {
      name?: string;
      description?: string;
      dimensions?: QualityDimensionConfig[];
      isDefault?: boolean;
    },
  ): Promise<QualityProfile | null> {
    const profile = await this.profileRepository.findOne({ where: { id } });
    if (!profile) return null;

    // If setting as default, unset other defaults
    if (params.isDefault && !profile.isDefault) {
      await this.unsetDefaultProfiles(profile.projectId);
    }

    if (params.name !== undefined) profile.name = params.name;
    if (params.description !== undefined) profile.description = params.description;
    if (params.dimensions !== undefined) profile.dimensions = params.dimensions;
    if (params.isDefault !== undefined) profile.isDefault = params.isDefault;

    return this.profileRepository.save(profile);
  }

  /**
   * Delete a quality profile.
   */
  async deleteProfile(id: string): Promise<boolean> {
    const result = await this.profileRepository.delete({ id });
    return (result.affected || 0) > 0;
  }

  /**
   * Unset default flag on all profiles for a project (or system-wide).
   */
  private async unsetDefaultProfiles(projectId: string | null): Promise<void> {
    const qb = this.profileRepository
      .createQueryBuilder()
      .update(QualityProfile)
      .set({ isDefault: false })
      .where('isDefault = :isDefault', { isDefault: true });

    if (projectId) {
      qb.andWhere('projectId = :projectId', { projectId });
    } else {
      qb.andWhere('projectId IS NULL');
    }

    await qb.execute();
  }

  /**
   * Convert QualityProfile entity to response DTO.
   */
  toProfileResponse(profile: QualityProfile): QualityProfileResponseDto {
    return {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      projectId: profile.projectId,
      dimensions: profile.dimensions,
      isDefault: profile.isDefault,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}
