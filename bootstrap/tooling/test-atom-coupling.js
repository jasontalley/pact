#!/usr/bin/env node
/**
 * BOOTSTRAP SCAFFOLDING - DO NOT DEPEND ON THIS
 * Scaffold ID: BS-003
 * Type: Tooling
 * Purpose: CLI for test-atom coupling analysis
 * Exit Criterion: Pact runtime provides coupling analysis via API
 * Target Removal: Phase 1
 * Owner: TBD
 */

const fs = require('fs');
const path = require('path');

// Configuration
const TEST_PATTERNS = ['**/*.spec.ts', '**/*.test.ts'];
const EXCLUDE_PATTERNS = ['**/node_modules/**', '**/dist/**', '**/coverage/**'];
const MIN_COUPLING_SCORE = 80;

// Colors for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function main() {
  const args = process.argv.slice(2);
  const testDirectory = args[0] || 'src';
  const warnOnly = args.includes('--warn-only');

  console.log('=== Test-Atom Coupling Analysis ===\n');
  console.log(`Scanning: ${testDirectory}`);
  console.log(`Minimum coupling score: ${MIN_COUPLING_SCORE}%\n`);

  const result = analyzeCoupling(testDirectory);
  printReport(result);

  if (!result.passesGate) {
    if (warnOnly) {
      console.log(`\n${colors.yellow}WARNING: Coupling check would fail but --warn-only is set${colors.reset}`);
      process.exit(0);
    } else {
      console.log(`\n${colors.red}FAILED: Coupling score is below threshold${colors.reset}`);
      process.exit(1);
    }
  }

  console.log(`\n${colors.green}PASSED: Test-atom coupling meets requirements${colors.reset}`);
  process.exit(0);
}

function analyzeCoupling(testDirectory) {
  const testFiles = findTestFiles(testDirectory);
  const analyses = testFiles.map(analyzeTestFile);

  const totalTests = analyses.reduce((sum, a) => sum + a.totalTests, 0);
  const annotatedTests = analyses.reduce((sum, a) => sum + a.annotatedTests, 0);
  const allOrphanTests = analyses.flatMap((a) => a.orphanTests);
  const allReferencedAtomIds = new Set(analyses.flatMap((a) => a.referencedAtomIds));

  const couplingScore = totalTests > 0 ? Math.round((annotatedTests / totalTests) * 100) : 100;

  return {
    summary: {
      totalTestFiles: testFiles.length,
      totalTests,
      annotatedTests,
      orphanTestCount: allOrphanTests.length,
      couplingScore,
    },
    orphanTests: allOrphanTests,
    referencedAtomIds: Array.from(allReferencedAtomIds),
    testFileAnalyses: analyses,
    passesGate: couplingScore >= MIN_COUPLING_SCORE,
  };
}

function findTestFiles(directory) {
  const testFiles = [];

  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(directory, fullPath);

      // Check exclusions
      if (matchesPatterns(relativePath, EXCLUDE_PATTERNS)) continue;

      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        if (matchesPatterns(relativePath, TEST_PATTERNS) || matchesPatterns(entry.name, TEST_PATTERNS)) {
          testFiles.push(fullPath);
        }
      }
    }
  }

  walkDir(directory);
  return testFiles;
}

function matchesPatterns(filePath, patterns) {
  for (const pattern of patterns) {
    if (matchGlob(filePath, pattern)) return true;
  }
  return false;
}

function matchGlob(filePath, pattern) {
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

function analyzeTestFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const referencedAtomIds = new Set();
  const orphanTests = [];
  let totalTests = 0;
  let annotatedTests = 0;

  // Match both // @atom and * @atom (JSDoc style) annotations
  const atomAnnotationRegex = /(?:\/\/|\*)\s*@atom\s+(IA-\d+)/g;
  const testRegex = /^\s*(it|test)\s*\(\s*['"`](.+?)['"`]/;
  const describeRegex = /^\s*describe\s*\(\s*['"`](.+?)['"`]/;

  let lastAnnotationLine = -1;
  let lastAnnotationAtomId = null;
  let currentDescribe = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    const describeMatch = line.match(describeRegex);
    if (describeMatch) {
      currentDescribe = describeMatch[1];
    }

    const atomMatches = [...line.matchAll(atomAnnotationRegex)];
    if (atomMatches.length > 0) {
      lastAnnotationLine = lineNumber;
      lastAnnotationAtomId = atomMatches[atomMatches.length - 1][1];
      referencedAtomIds.add(lastAnnotationAtomId);
    }

    const testMatch = line.match(testRegex);
    if (testMatch) {
      totalTests++;
      const testName = testMatch[2];
      // JSDoc comments can be further away, use 5-line lookback
      const hasRecentAnnotation = lastAnnotationLine >= lineNumber - 5;

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

function printReport(result) {
  const { summary, orphanTests } = result;

  console.log('SUMMARY');
  console.log('-'.repeat(40));
  console.log(`Total Test Files:     ${summary.totalTestFiles}`);
  console.log(`Total Tests:          ${summary.totalTests}`);
  console.log(`Annotated Tests:      ${summary.annotatedTests}`);
  console.log(`Orphan Tests:         ${summary.orphanTestCount}`);
  console.log(`Coupling Score:       ${summary.couplingScore}%`);
  console.log(`Gate Status:          ${result.passesGate ? colors.green + 'PASSED' : colors.red + 'FAILED'}${colors.reset}`);
  console.log('');

  if (orphanTests.length > 0 && orphanTests.length <= 20) {
    console.log('ORPHAN TESTS (tests without @atom annotations)');
    console.log('-'.repeat(40));
    for (const orphan of orphanTests) {
      const relativePath = path.relative(process.cwd(), orphan.filePath);
      console.log(`  ${relativePath}:${orphan.lineNumber}`);
      console.log(`    "${orphan.testName}"`);
    }
    console.log('');
  } else if (orphanTests.length > 20) {
    console.log(`ORPHAN TESTS: ${orphanTests.length} tests (too many to list, showing first 10)`);
    console.log('-'.repeat(40));
    for (const orphan of orphanTests.slice(0, 10)) {
      const relativePath = path.relative(process.cwd(), orphan.filePath);
      console.log(`  ${relativePath}:${orphan.lineNumber}`);
      console.log(`    "${orphan.testName}"`);
    }
    console.log(`  ... and ${orphanTests.length - 10} more`);
    console.log('');
  }
}

main();
