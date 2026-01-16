import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Atom } from '../atoms/atom.entity';

export interface TestFileAnalysis {
  filePath: string;
  totalTests: number;
  annotatedTests: number;
  orphanTests: OrphanTest[];
  referencedAtomIds: string[];
}

export interface OrphanTest {
  filePath: string;
  testName: string;
  lineNumber: number;
}

export interface UnrealizedAtom {
  atomId: string;
  description: string;
  status: string;
}

export interface AtomMismatch {
  atomId: string;
  testFile: string;
  testName: string;
  issue: string;
}

export interface CouplingAnalysisResult {
  summary: {
    totalTestFiles: number;
    totalTests: number;
    annotatedTests: number;
    orphanTestCount: number;
    unrealizedAtomCount: number;
    mismatchCount: number;
    couplingScore: number; // 0-100, percentage of tests properly coupled
  };
  orphanTests: OrphanTest[];
  unrealizedAtoms: UnrealizedAtom[];
  mismatches: AtomMismatch[];
  testFileAnalyses: TestFileAnalysis[];
  passesGate: boolean;
}

export interface CouplingCheckOptions {
  testDirectory?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  minCouplingScore?: number;
}

@Injectable()
export class TestAtomCouplingService {
  private readonly logger = new Logger(TestAtomCouplingService.name);
  private readonly defaultTestPatterns = ['**/*.spec.ts', '**/*.test.ts'];
  private readonly defaultExcludePatterns = ['**/node_modules/**', '**/dist/**'];

  constructor(
    @InjectRepository(Atom)
    private atomRepository: Repository<Atom>,
  ) {}

  /**
   * Analyze coupling between tests and atoms
   */
  async analyzeCoupling(options: CouplingCheckOptions = {}): Promise<CouplingAnalysisResult> {
    const testDirectory = options.testDirectory || process.cwd();
    const minCouplingScore = options.minCouplingScore ?? 80;

    this.logger.log(`Analyzing test-atom coupling in: ${testDirectory}`);

    // Step 1: Find all test files
    const testFiles = this.findTestFiles(testDirectory, options);
    this.logger.log(`Found ${testFiles.length} test files`);

    // Step 2: Analyze each test file
    const testFileAnalyses: TestFileAnalysis[] = [];
    const allOrphanTests: OrphanTest[] = [];
    const allReferencedAtomIds = new Set<string>();

    for (const filePath of testFiles) {
      const analysis = this.analyzeTestFile(filePath);
      testFileAnalyses.push(analysis);
      allOrphanTests.push(...analysis.orphanTests);
      analysis.referencedAtomIds.forEach((id) => allReferencedAtomIds.add(id));
    }

    // Step 3: Get all committed atoms from database
    const committedAtoms = await this.atomRepository.find({
      where: { status: 'committed' },
    });

    // Step 4: Find unrealized atoms (committed but no tests reference them)
    const unrealizedAtoms: UnrealizedAtom[] = committedAtoms
      .filter((atom) => !allReferencedAtomIds.has(atom.atomId))
      .map((atom) => ({
        atomId: atom.atomId,
        description: atom.description,
        status: atom.status,
      }));

    // Step 5: Find mismatches (tests reference non-existent atoms)
    const existingAtomIds = new Set(
      (await this.atomRepository.find()).map((a) => a.atomId),
    );
    const mismatches: AtomMismatch[] = [];

    for (const analysis of testFileAnalyses) {
      for (const referencedId of analysis.referencedAtomIds) {
        if (!existingAtomIds.has(referencedId)) {
          mismatches.push({
            atomId: referencedId,
            testFile: analysis.filePath,
            testName: 'Unknown', // Would need deeper analysis to get exact test name
            issue: `Referenced atom ${referencedId} does not exist in the database`,
          });
        }
      }
    }

    // Step 6: Calculate summary
    const totalTests = testFileAnalyses.reduce((sum, a) => sum + a.totalTests, 0);
    const annotatedTests = testFileAnalyses.reduce((sum, a) => sum + a.annotatedTests, 0);
    const couplingScore = totalTests > 0 ? Math.round((annotatedTests / totalTests) * 100) : 100;

    const result: CouplingAnalysisResult = {
      summary: {
        totalTestFiles: testFiles.length,
        totalTests,
        annotatedTests,
        orphanTestCount: allOrphanTests.length,
        unrealizedAtomCount: unrealizedAtoms.length,
        mismatchCount: mismatches.length,
        couplingScore,
      },
      orphanTests: allOrphanTests,
      unrealizedAtoms,
      mismatches,
      testFileAnalyses,
      passesGate: couplingScore >= minCouplingScore && mismatches.length === 0,
    };

    this.logger.log(
      `Coupling analysis complete: ${couplingScore}% coupled, ${allOrphanTests.length} orphan tests, ${unrealizedAtoms.length} unrealized atoms`,
    );

    return result;
  }

  /**
   * Find test files in a directory
   */
  private findTestFiles(
    directory: string,
    options: CouplingCheckOptions,
  ): string[] {
    const includePatterns = options.includePatterns || this.defaultTestPatterns;
    const excludePatterns = options.excludePatterns || this.defaultExcludePatterns;
    const testFiles: string[] = [];

    const walkDir = (dir: string) => {
      if (!fs.existsSync(dir)) {
        return;
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(directory, fullPath);

        // Check exclusions
        if (this.matchesPatterns(relativePath, excludePatterns)) {
          continue;
        }

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile()) {
          if (this.matchesPatterns(relativePath, includePatterns)) {
            testFiles.push(fullPath);
          }
        }
      }
    };

    walkDir(directory);
    return testFiles;
  }

  /**
   * Check if a path matches any of the glob patterns
   */
  private matchesPatterns(filePath: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (this.matchGlob(filePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simple glob matching (supports * and **)
   */
  private matchGlob(filePath: string, pattern: string): boolean {
    // Convert glob pattern to regex
    let regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<GLOBSTAR>>>/g, '.*');

    // Handle patterns like **/*.spec.ts - should match files in root too
    // The pattern ".*/" would require a slash, but files in root have no leading slash
    if (regexPattern.startsWith('.*/')) {
      regexPattern = `(${regexPattern}|${regexPattern.slice(3)})`;
    }

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  /**
   * Analyze a single test file for @atom annotations
   */
  analyzeTestFile(filePath: string): TestFileAnalysis {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const referencedAtomIds = new Set<string>();
    const orphanTests: OrphanTest[] = [];
    let totalTests = 0;
    let annotatedTests = 0;

    // Regex patterns
    const atomAnnotationRegex = /\/\/\s*@atom\s+(IA-\d+)/g;
    const testRegex = /^\s*(it|test)\s*\(\s*['"`](.+?)['"`]/;
    const describeRegex = /^\s*describe\s*\(\s*['"`](.+?)['"`]/;

    // Track annotations in scope
    let lastAnnotationLine = -1;
    let lastAnnotationAtomId: string | null = null;
    let currentDescribe = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check for describe blocks
      const describeMatch = line.match(describeRegex);
      if (describeMatch) {
        currentDescribe = describeMatch[1];
      }

      // Check for @atom annotations
      const atomMatches = [...line.matchAll(atomAnnotationRegex)];
      if (atomMatches.length > 0) {
        lastAnnotationLine = lineNumber;
        lastAnnotationAtomId = atomMatches[atomMatches.length - 1][1];
        referencedAtomIds.add(lastAnnotationAtomId);
      }

      // Check for test declarations
      const testMatch = line.match(testRegex);
      if (testMatch) {
        totalTests++;
        const testName = testMatch[2];

        // Check if there's an @atom annotation within 3 lines before this test
        const hasRecentAnnotation = lastAnnotationLine >= lineNumber - 3;

        if (hasRecentAnnotation && lastAnnotationAtomId) {
          annotatedTests++;
        } else {
          orphanTests.push({
            filePath,
            testName: currentDescribe ? `${currentDescribe} > ${testName}` : testName,
            lineNumber,
          });
        }
      }
    }

    return {
      filePath,
      totalTests,
      annotatedTests,
      orphanTests,
      referencedAtomIds: Array.from(referencedAtomIds),
    };
  }

  /**
   * Generate a formatted report of the coupling analysis
   */
  generateReport(result: CouplingAnalysisResult): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('TEST-ATOM COUPLING ANALYSIS REPORT');
    lines.push('='.repeat(60));
    lines.push('');

    // Summary
    lines.push('SUMMARY');
    lines.push('-'.repeat(40));
    lines.push(`Total Test Files:     ${result.summary.totalTestFiles}`);
    lines.push(`Total Tests:          ${result.summary.totalTests}`);
    lines.push(`Annotated Tests:      ${result.summary.annotatedTests}`);
    lines.push(`Orphan Tests:         ${result.summary.orphanTestCount}`);
    lines.push(`Unrealized Atoms:     ${result.summary.unrealizedAtomCount}`);
    lines.push(`Mismatches:           ${result.summary.mismatchCount}`);
    lines.push(`Coupling Score:       ${result.summary.couplingScore}%`);
    lines.push(`Gate Status:          ${result.passesGate ? 'PASSED' : 'FAILED'}`);
    lines.push('');

    // Orphan Tests
    if (result.orphanTests.length > 0) {
      lines.push('ORPHAN TESTS (tests without @atom annotations)');
      lines.push('-'.repeat(40));
      for (const orphan of result.orphanTests.slice(0, 20)) {
        const relativePath = path.relative(process.cwd(), orphan.filePath);
        lines.push(`  ${relativePath}:${orphan.lineNumber}`);
        lines.push(`    "${orphan.testName}"`);
      }
      if (result.orphanTests.length > 20) {
        lines.push(`  ... and ${result.orphanTests.length - 20} more`);
      }
      lines.push('');
    }

    // Unrealized Atoms
    if (result.unrealizedAtoms.length > 0) {
      lines.push('UNREALIZED ATOMS (committed atoms without tests)');
      lines.push('-'.repeat(40));
      for (const atom of result.unrealizedAtoms.slice(0, 20)) {
        lines.push(`  ${atom.atomId}: ${atom.description.substring(0, 60)}...`);
      }
      if (result.unrealizedAtoms.length > 20) {
        lines.push(`  ... and ${result.unrealizedAtoms.length - 20} more`);
      }
      lines.push('');
    }

    // Mismatches
    if (result.mismatches.length > 0) {
      lines.push('MISMATCHES (INV-009 violations)');
      lines.push('-'.repeat(40));
      for (const mismatch of result.mismatches.slice(0, 20)) {
        lines.push(`  ${mismatch.atomId} in ${path.relative(process.cwd(), mismatch.testFile)}`);
        lines.push(`    Issue: ${mismatch.issue}`);
      }
      if (result.mismatches.length > 20) {
        lines.push(`  ... and ${result.mismatches.length - 20} more`);
      }
      lines.push('');
    }

    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  /**
   * Check coupling and throw if gate fails (for CI/pre-commit)
   */
  async checkCouplingGate(options: CouplingCheckOptions = {}): Promise<void> {
    const result = await this.analyzeCoupling(options);

    if (!result.passesGate) {
      const report = this.generateReport(result);
      this.logger.error('Test-atom coupling gate FAILED');
      throw new Error(
        `Test-atom coupling gate failed:\n${report}\n\n` +
          `Coupling score: ${result.summary.couplingScore}% (minimum: ${options.minCouplingScore ?? 80}%)\n` +
          `Mismatches: ${result.summary.mismatchCount}`,
      );
    }

    this.logger.log('Test-atom coupling gate PASSED');
  }
}
