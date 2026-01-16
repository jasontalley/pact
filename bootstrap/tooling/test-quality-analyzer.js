/**
 * BOOTSTRAP SCAFFOLDING - DO NOT DEPEND ON THIS
 * Scaffold ID: BS-001
 * Type: Tooling
 * Purpose: Analyze test quality before Green phase (Red phase gate)
 * Exit Criterion: Pact runtime provides built-in test quality analysis
 * Target Removal: Phase 1
 * Owner: @jasontalley
 */

const fs = require('node:fs');
const path = require('node:path');

// Quality dimensions (from /ingest/test-quality.md)
const QUALITY_DIMENSIONS = {
  intentFidelity: { weight: 0.2, threshold: 0.7 },
  noVacuousTests: { weight: 0.15, threshold: 0.9 },
  noBrittleTests: { weight: 0.15, threshold: 0.8 },
  determinism: { weight: 0.1, threshold: 0.95 },
  failureSignalQuality: { weight: 0.15, threshold: 0.7 },
  integrationTestAuthenticity: { weight: 0.15, threshold: 0.8 },
  boundaryAndNegativeCoverage: { weight: 0.1, threshold: 0.6 },
};

function analyzeTestFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Run all checks and collect both scores and diagnostics
  const checkResults = {
    intentFidelity: checkIntentFidelity(content),
    noVacuousTests: checkForVacuousTests(content),
    noBrittleTests: checkForBrittleTests(content),
    determinism: checkDeterminism(content),
    failureSignalQuality: checkFailureSignalQuality(content),
    integrationTestAuthenticity: checkIntegrationAuthenticity(content, filePath),
    boundaryAndNegativeCoverage: checkBoundaryAndNegativeCoverage(content),
  };

  // Extract scores for backward compatibility with calculateOverallScore/checkThresholds
  const scores = {};
  const diagnostics = {};
  Object.entries(checkResults).forEach(([key, result]) => {
    scores[key] = result.score;
    diagnostics[key] = result.diagnostics;
  });

  const overallScore = calculateOverallScore(scores);
  const passed = checkThresholds(scores);

  return {
    filePath,
    scores,
    diagnostics,
    overallScore,
    passed,
    issues: collectIssues(scores, diagnostics),
  };
}

function checkIntentFidelity(content) {
  // Check for @atom annotations
  const atomAnnotations = (content.match(/@atom IA-\d{3}/g) || []).length;
  const testCases = (content.match(/it\(/g) || []).length;

  if (testCases === 0) {
    return { score: 1, diagnostics: { atomAnnotations: 0, testCases: 0 } };
  }

  const coverage = atomAnnotations / testCases;
  return {
    score: Math.min(coverage, 1),
    diagnostics: {
      atomAnnotations,
      testCases,
      missing: testCases - atomAnnotations,
    },
  };
}

function checkForVacuousTests(content) {
  const vacuousPatterns = [
    { pattern: /expect\([^)]+\)\.toBeDefined\(\)/g, name: 'toBeDefined()' },
    { pattern: /expect\([^)]+\)\.toBeTruthy\(\)/g, name: 'toBeTruthy()' },
    { pattern: /expect\(true\)\.toBe\(true\)/g, name: 'toBe(true) literal' },
  ];

  const vacuousDetails = {};
  let vacuousCount = 0;
  vacuousPatterns.forEach(({ pattern, name }) => {
    const count = (content.match(pattern) || []).length;
    if (count > 0) {
      vacuousDetails[name] = count;
      vacuousCount += count;
    }
  });

  const totalAssertions = (content.match(/expect\(/g) || []).length;
  if (totalAssertions === 0) {
    return { score: 1, diagnostics: { vacuousCount: 0, totalAssertions: 0 } };
  }

  return {
    score: 1 - vacuousCount / totalAssertions,
    diagnostics: {
      vacuousCount,
      totalAssertions,
      strongAssertions: totalAssertions - vacuousCount,
      vacuousDetails,
    },
  };
}

function checkForBrittleTests(content) {
  const brittlePatterns = [
    { pattern: /\.toHaveBeenCalledTimes\(/g, name: 'toHaveBeenCalledTimes()' },
    { pattern: /toMatchSnapshot\(\)/g, name: 'toMatchSnapshot()' },
  ];

  const brittleDetails = {};
  let brittleCount = 0;
  brittlePatterns.forEach(({ pattern, name }) => {
    const count = (content.match(pattern) || []).length;
    if (count > 0) {
      brittleDetails[name] = count;
      brittleCount += count;
    }
  });

  const totalTests = (content.match(/it\(/g) || []).length;
  if (totalTests === 0) {
    return { score: 1, diagnostics: { brittleCount: 0, totalTests: 0 } };
  }

  return {
    score: Math.max(0, 1 - (brittleCount / totalTests) * 0.5),
    diagnostics: {
      brittleCount,
      totalTests,
      brittleDetails,
    },
  };
}

function checkDeterminism(content) {
  const nonDeterministicPatterns = [
    { pattern: /Math\.random\(\)/g, name: 'Math.random()' },
    { pattern: /Date\.now\(\)/g, name: 'Date.now()' },
    { pattern: /new Date\(\)/g, name: 'new Date()' },
    { pattern: /fetch\(/g, name: 'fetch()' },
    { pattern: /axios\./g, name: 'axios' },
  ];

  const isMocked = content.includes('jest.mock') || content.includes('jest.spyOn');
  const unmockedDetails = {};
  let issues = 0;

  nonDeterministicPatterns.forEach(({ pattern, name }) => {
    const matches = content.match(pattern) || [];
    if (matches.length > 0 && !isMocked) {
      unmockedDetails[name] = matches.length;
      issues += matches.length;
    }
  });

  return {
    score: issues === 0 ? 1 : Math.max(0, 1 - issues * 0.1),
    diagnostics: {
      unmockedCount: issues,
      isMocked,
      unmockedDetails,
    },
  };
}

function checkFailureSignalQuality(content) {
  // Strip template literal contents to avoid counting mock test content as assertions
  // This removes content between backticks but preserves the structure
  const contentWithoutTemplateLiterals = content.replaceAll(/`[^`]*`/g, '``');

  // Check if custom error messages are provided
  // Jest doesn't support second argument for custom messages like some frameworks
  // So we also count inline comments before expect() as valid failure signals
  const assertionsWithInlineMessages = (
    contentWithoutTemplateLiterals.match(/expect\([^)]+\)\.[^;]+,\s*['"`]/g) || []
  ).length;

  // Count comments immediately before expect() statements as failure signals
  // Pattern: // comment\n    expect(
  const assertionsWithComments = (
    contentWithoutTemplateLiterals.match(/\/\/[^\n]+\n\s*expect\(/g) || []
  ).length;

  const totalAssertions = (contentWithoutTemplateLiterals.match(/expect\(/g) || []).length;

  if (totalAssertions === 0) {
    return { score: 1, diagnostics: { documented: 0, totalAssertions: 0 } };
  }

  const documented = assertionsWithInlineMessages + assertionsWithComments;
  return {
    score: Math.min(documented / totalAssertions, 1),
    diagnostics: {
      withComments: assertionsWithComments,
      withInlineMessages: assertionsWithInlineMessages,
      documented,
      totalAssertions,
      undocumented: totalAssertions - documented,
    },
  };
}

function checkIntegrationAuthenticity(content, filePath) {
  const isIntegrationTest =
    filePath.includes('integration') || filePath.includes('e2e');

  if (!isIntegrationTest) {
    return { score: 1, diagnostics: { isIntegrationTest: false, notApplicable: true } };
  }

  // Check for inappropriate mocks in integration tests
  const mockPatterns = [
    { pattern: /jest\.mock\(/g, name: 'jest.mock()' },
    { pattern: /\.mockImplementation\(/g, name: 'mockImplementation()' },
    { pattern: /\.mockReturnValue\(/g, name: 'mockReturnValue()' },
  ];

  const mockDetails = {};
  let mockCount = 0;
  mockPatterns.forEach(({ pattern, name }) => {
    const count = (content.match(pattern) || []).length;
    if (count > 0) {
      mockDetails[name] = count;
      mockCount += count;
    }
  });

  // Integration tests should have minimal mocking
  return {
    score: mockCount === 0 ? 1 : Math.max(0, 1 - mockCount * 0.2),
    diagnostics: {
      isIntegrationTest: true,
      mockCount,
      mockDetails,
    },
  };
}

function checkBoundaryAndNegativeCoverage(content) {
  const boundaryPatterns = [
    { pattern: /toBe\(0\)/g, name: 'toBe(0)' },
    { pattern: /toBe\(null\)/g, name: 'toBe(null)' },
    { pattern: /toBe\(undefined\)/g, name: 'toBe(undefined)' },
    { pattern: /toBeNull\(\)/g, name: 'toBeNull()' },
    { pattern: /toBeUndefined\(\)/g, name: 'toBeUndefined()' },
    { pattern: /toBeGreaterThan\(/g, name: 'toBeGreaterThan()' },
    { pattern: /toBeLessThan\(/g, name: 'toBeLessThan()' },
    { pattern: /toThrow/g, name: 'toThrow()' },
    { pattern: /expect.*\.rejects/g, name: '.rejects' },
  ];

  const boundaryDetails = {};
  let boundaryTestCount = 0;
  boundaryPatterns.forEach(({ pattern, name }) => {
    const count = (content.match(pattern) || []).length;
    if (count > 0) {
      boundaryDetails[name] = count;
      boundaryTestCount += count;
    }
  });

  const totalTests = (content.match(/it\(/g) || []).length;
  if (totalTests === 0) {
    return { score: 1, diagnostics: { boundaryTestCount: 0, totalTests: 0 } };
  }

  // At least 30% of tests should cover boundaries/negatives
  const ratio = boundaryTestCount / totalTests;
  const targetCount = Math.ceil(totalTests * 0.3);

  return {
    score: Math.min(ratio / 0.3, 1),
    diagnostics: {
      boundaryTestCount,
      totalTests,
      ratio: (ratio * 100).toFixed(1) + '%',
      targetCount,
      needed: Math.max(0, targetCount - boundaryTestCount),
      boundaryDetails,
    },
  };
}

function calculateOverallScore(scores) {
  let weightedSum = 0;
  let totalWeight = 0;

  Object.keys(QUALITY_DIMENSIONS).forEach((dimension) => {
    const weight = QUALITY_DIMENSIONS[dimension].weight;
    weightedSum += scores[dimension] * weight;
    totalWeight += weight;
  });

  return (weightedSum / totalWeight) * 100;
}

function checkThresholds(scores) {
  const failures = [];

  Object.keys(QUALITY_DIMENSIONS).forEach((dimension) => {
    const threshold = QUALITY_DIMENSIONS[dimension].threshold;
    if (scores[dimension] < threshold) {
      failures.push({
        dimension,
        score: scores[dimension],
        threshold,
      });
    }
  });

  return failures.length === 0;
}

function collectIssues(scores, diagnostics = {}) {
  const issues = [];

  // Remediation hints for each dimension
  const remediationHints = {
    intentFidelity: 'Add "// @atom IA-XXX" comments before test cases to link them to Intent Atoms',
    noVacuousTests: 'Replace weak assertions like .toBeDefined() or .toBeTruthy() with specific value checks',
    noBrittleTests: 'Reduce use of .toHaveBeenCalledTimes() and toMatchSnapshot() - test behavior, not implementation',
    determinism: 'Mock Date, Math.random, and network calls with jest.spyOn() or jest.mock()',
    failureSignalQuality: 'Add a comment on the line directly BEFORE each expect() statement explaining what it tests',
    integrationTestAuthenticity: 'Remove mocks from integration tests - use real dependencies or Docker containers',
    boundaryAndNegativeCoverage: 'Add tests using .toBe(0), .toBe(null), .toBeNull(), .toThrow(), or .rejects',
  };

  // What each dimension measures
  const dimensionDescriptions = {
    intentFidelity: 'Tests linked to Intent Atoms via @atom comments',
    noVacuousTests: 'Assertions that test specific values (not just .toBeDefined())',
    noBrittleTests: 'Tests that don\'t couple to implementation details',
    determinism: 'Tests without unmocked sources of randomness (Date, Math.random, etc.)',
    failureSignalQuality: 'expect() statements with explanatory comment on preceding line',
    integrationTestAuthenticity: 'Integration tests without inappropriate mocking',
    boundaryAndNegativeCoverage: 'Tests covering edge cases (null, 0, errors, boundaries)',
  };

  // Generate human-readable diagnostic summary
  function formatDiagnostic(dimension, diag) {
    if (!diag) return null;

    // Helper to format detail objects as "Nx pattern, Mx pattern2"
    const formatDetails = (details) =>
      Object.entries(details || {})
        .map(([k, v]) => `${v}x ${k}`)
        .join(', ');

    switch (dimension) {
      case 'intentFidelity':
        if (diag.testCases === 0) return 'No test cases found';
        return `${diag.atomAnnotations} of ${diag.testCases} tests have @atom annotations (${diag.missing} missing)`;

      case 'noVacuousTests':
        if (diag.totalAssertions === 0) return 'No assertions found';
        if (diag.vacuousCount === 0) return null;
        return `${diag.vacuousCount} weak assertions found: ${formatDetails(diag.vacuousDetails)}`;

      case 'noBrittleTests':
        if (diag.brittleCount === 0) return null;
        return `${diag.brittleCount} brittle patterns found: ${formatDetails(diag.brittleDetails)}`;

      case 'determinism':
        if (diag.unmockedCount === 0) return null;
        return `${diag.unmockedCount} unmocked non-deterministic calls: ${formatDetails(diag.unmockedDetails)}`;

      case 'failureSignalQuality':
        if (diag.totalAssertions === 0) return 'No assertions found';
        return `${diag.documented} of ${diag.totalAssertions} expect() have comments (${diag.undocumented} need comments)`;

      case 'integrationTestAuthenticity':
        if (diag.notApplicable) return 'N/A (not an integration test)';
        if (diag.mockCount === 0) return null;
        return `${diag.mockCount} mocks in integration test: ${formatDetails(diag.mockDetails)}`;

      case 'boundaryAndNegativeCoverage':
        if (diag.totalTests === 0) return 'No tests found';
        return `${diag.boundaryTestCount} boundary tests (${diag.ratio} of tests). Target: ${diag.targetCount}. Found: ${formatDetails(diag.boundaryDetails) || 'none'}`;

      default:
        return null;
    }
  }

  Object.keys(QUALITY_DIMENSIONS).forEach((dimension) => {
    const threshold = QUALITY_DIMENSIONS[dimension].threshold;
    const score = scores[dimension];

    if (score < threshold) {
      const diag = diagnostics[dimension];
      const issue = {
        dimension,
        score: (score * 100).toFixed(1) + '%',
        threshold: (threshold * 100).toFixed(1) + '%',
        severity: score < threshold * 0.5 ? 'critical' : 'warning',
        description: dimensionDescriptions[dimension],
        fix: remediationHints[dimension],
        diagnostic: formatDiagnostic(dimension, diag),
        rawDiagnostics: diag,
      };

      issues.push(issue);
    }
  });

  return issues;
}

// Find all test files recursively
function findTestFiles(dir) {
  const results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory() && item.name !== 'node_modules') {
      results.push(...findTestFiles(fullPath));
    } else if (item.isFile() && item.name.endsWith('.spec.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

// HTML Report Generator
function generateHtmlReport(results) {
  const timestamp = new Date().toISOString();
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;
  const avgScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.overallScore, 0) / results.length
    : 100;

  const getScoreColor = (score) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#eab308';
    return '#ef4444';
  };

  const fileRows = results
    .map((result) => {
      const relativePath = path.relative(process.cwd(), result.filePath);
      const issueHtml =
        result.issues.length > 0
          ? `<div class="issues">${result.issues
              .map(
                (i) => `
                  <div class="issue ${i.severity}">
                    <div class="issue-header">
                      ${i.severity === 'critical' ? '🔴' : '🟡'}
                      <strong>${i.dimension}</strong>: ${i.score} (need ${i.threshold})
                    </div>
                    ${i.diagnostic ? `<div class="issue-diagnostic">📊 ${i.diagnostic}</div>` : ''}
                    <div class="issue-fix">💡 ${i.fix}</div>
                  </div>`,
              )
              .join('')}</div>`
          : '<span class="no-issues">✅ No issues</span>';

      return `
        <tr class="${result.passed ? 'passed' : 'failed'}">
          <td>${relativePath}</td>
          <td style="color: ${getScoreColor(result.overallScore)}">${result.overallScore.toFixed(1)}%</td>
          <td>${result.passed ? '✅' : '❌'}</td>
        </tr>
        <tr class="issues-row">
          <td colspan="3">${issueHtml}</td>
        </tr>
      `;
    })
    .join('');

  const dimensionRows = Object.entries(QUALITY_DIMENSIONS)
    .map(([key, config]) => {
      const avgDimScore =
        results.length > 0
          ? (results.reduce((sum, r) => sum + (r.scores[key] || 0), 0) / results.length) * 100
          : 100;
      return `
        <tr>
          <td>${key}</td>
          <td style="color: ${getScoreColor(avgDimScore)}">${avgDimScore.toFixed(1)}%</td>
          <td>${(config.threshold * 100).toFixed(0)}%</td>
          <td>${avgDimScore >= config.threshold * 100 ? '✅' : '❌'}</td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Quality Report - ${timestamp.split('T')[0]}</title>
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
    tr.failed td:first-child { border-left: 3px solid #ef4444; }
    .issues-row { background: #16213e; }
    .issues-row td { padding: 8px 12px; font-size: 0.9em; }
    .issues { margin: 0; }
    .issue { margin: 8px 0; padding: 10px; background: #1e293b; border-radius: 6px; border-left: 3px solid #eab308; }
    .issue.critical { border-left-color: #ef4444; }
    .issue-header { font-size: 0.95em; margin-bottom: 6px; }
    .issue-diagnostic { color: #94a3b8; font-size: 0.85em; margin: 4px 0 4px 20px; }
    .issue-fix { color: #22d3ee; font-size: 0.85em; margin: 4px 0 0 20px; }
    .no-issues { color: #22c55e; }
    footer {
      margin-top: 40px; padding-top: 20px; border-top: 1px solid #334155;
      color: #64748b; font-size: 0.85em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Test Quality Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>

    <div class="summary">
      <div class="stat">
        <div class="stat-value" style="color: ${getScoreColor(avgScore)}">${avgScore.toFixed(1)}%</div>
        <div class="stat-label">Overall Score</div>
      </div>
      <div class="stat">
        <div class="stat-value">${results.length}</div>
        <div class="stat-label">Total Files</div>
      </div>
      <div class="stat">
        <div class="stat-value" style="color: #22c55e">${passedCount}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat">
        <div class="stat-value" style="color: ${failedCount > 0 ? '#ef4444' : '#22c55e'}">${failedCount}</div>
        <div class="stat-label">Failed</div>
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

    <h2>File Details</h2>
    <table>
      <thead>
        <tr><th>File</th><th>Score</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${fileRows}
      </tbody>
    </table>

    <footer>
      <p>Generated by Pact Test Quality Analyzer (Bootstrap Scaffolding BS-001)</p>
      <p>7 quality dimensions: Intent Fidelity, No Vacuous Tests, No Brittle Tests,
         Determinism, Failure Signal Quality, Integration Authenticity, Boundary Coverage</p>
    </footer>
  </div>
</body>
</html>`;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const testFilePath = args.find((arg) => !arg.startsWith('--'));
  const generateReport = args.includes('--report');
  const reportPath = args.find((arg) => arg.startsWith('--output='))?.split('=')[1];

  // If no path provided, analyze all test files
  if (!testFilePath) {
    console.log('\n=== Test Quality Analysis (All Files) ===\n');

    const srcDir = path.join(process.cwd(), 'src');
    if (!fs.existsSync(srcDir)) {
      console.error('Error: src directory not found');
      process.exit(1);
    }

    const testFiles = findTestFiles(srcDir);
    if (testFiles.length === 0) {
      console.log('No test files found in src/');
      process.exit(0);
    }

    let allPassed = true;
    const results = [];

    testFiles.forEach((file) => {
      try {
        const result = analyzeTestFile(file);
        results.push(result);
        if (!result.passed) allPassed = false;
      } catch (error) {
        console.error(`Error analyzing ${file}: ${error.message}`);
      }
    });

    // Summary output
    const verbose = args.includes('--verbose') || args.includes('-v');

    results.forEach((result) => {
      const status = result.passed ? '✅' : '❌';
      const relativePath = path.relative(process.cwd(), result.filePath);
      console.log(`${status} ${relativePath}: ${result.overallScore.toFixed(1)}%`);

      if (result.issues.length > 0) {
        result.issues.forEach((issue) => {
          const icon = issue.severity === 'critical' ? '   🔴' : '   🟡';
          console.log(`${icon} ${issue.dimension}: ${issue.score} (need ${issue.threshold})`);
          if (issue.diagnostic) {
            console.log(`      📊 ${issue.diagnostic}`);
          }
          if (verbose && issue.fix) {
            console.log(`      💡 Fix: ${issue.fix}`);
          }
        });
      }
    });

    console.log(`\nTotal: ${results.length} files analyzed`);
    console.log(`Passed: ${results.filter((r) => r.passed).length}`);
    console.log(`Failed: ${results.filter((r) => !r.passed).length}`);

    // Show help hint if there are failures and not in verbose mode
    if (!allPassed && !verbose) {
      console.log('\nTip: Run with --verbose or -v for remediation hints');
    }

    // Generate HTML report if requested
    if (generateReport) {
      const html = generateHtmlReport(results);
      const outputPath = reportPath || 'test/reports/quality-report.html';
      const outputDir = path.dirname(outputPath);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, html);
      console.log(`\nHTML report generated: ${outputPath}`);
    }

    process.exit(allPassed ? 0 : 1);
  }

  try {
    const result = analyzeTestFile(testFilePath);
    const verbose = args.includes('--verbose') || args.includes('-v');

    console.log('\n=== Test Quality Analysis ===\n');
    console.log(`File: ${result.filePath}`);
    console.log(`Overall Score: ${result.overallScore.toFixed(1)}%`);
    console.log(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}\n`);

    if (result.issues.length > 0) {
      console.log('Issues Found:\n');
      result.issues.forEach((issue) => {
        const icon = issue.severity === 'critical' ? '🔴' : '🟡';
        console.log(`${icon} ${issue.dimension}: ${issue.score} (need ${issue.threshold})`);
        console.log(`   📖 What it measures: ${issue.description}`);
        if (issue.diagnostic) {
          console.log(`   📊 Current state: ${issue.diagnostic}`);
        }
        console.log(`   💡 How to fix: ${issue.fix}`);
        console.log('');
      });
    }

    // Show dimension legend if verbose
    if (verbose) {
      console.log('--- All Dimension Scores ---');
      Object.entries(result.scores).forEach(([dim, score]) => {
        const threshold = QUALITY_DIMENSIONS[dim].threshold;
        const status = score >= threshold ? '✅' : '❌';
        console.log(`${status} ${dim}: ${(score * 100).toFixed(1)}% (threshold: ${(threshold * 100).toFixed(0)}%)`);
      });
      console.log('');
    }

    process.exit(result.passed ? 0 : 1);
  } catch (error) {
    console.error(`Error analyzing test file: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { analyzeTestFile, generateHtmlReport };
