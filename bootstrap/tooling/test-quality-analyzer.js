/**
 * BOOTSTRAP SCAFFOLDING - DO NOT DEPEND ON THIS
 * Scaffold ID: BS-001
 * Type: Tooling
 * Purpose: Analyze test quality before Green phase (Red phase gate)
 * Exit Criterion: Pact runtime provides built-in test quality analysis
 * Target Removal: Phase 1
 * Owner: @jasontalley
 */

const fs = require('fs');
const path = require('path');

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

  const scores = {
    intentFidelity: checkIntentFidelity(content),
    noVacuousTests: checkForVacuousTests(content),
    noBrittleTests: checkForBrittleTests(content),
    determinism: checkDeterminism(content),
    failureSignalQuality: checkFailureSignalQuality(content),
    integrationTestAuthenticity: checkIntegrationAuthenticity(content, filePath),
    boundaryAndNegativeCoverage: checkBoundaryAndNegativeCoverage(content),
  };

  const overallScore = calculateOverallScore(scores);
  const passed = checkThresholds(scores);

  return {
    filePath,
    scores,
    overallScore,
    passed,
    issues: collectIssues(scores),
  };
}

function checkIntentFidelity(content) {
  // Check for @atom annotations
  const atomAnnotations = (content.match(/@atom IA-\d{3}/g) || []).length;
  const testCases = (content.match(/it\(/g) || []).length;

  if (testCases === 0) return 1.0; // No tests yet

  const coverage = atomAnnotations / testCases;
  return Math.min(coverage, 1.0);
}

function checkForVacuousTests(content) {
  const vacuousPatterns = [
    /expect\([^)]+\)\.toBeDefined\(\)/g,
    /expect\([^)]+\)\.toBeTruthy\(\)/g,
    /expect\(true\)\.toBe\(true\)/g,
  ];

  let vacuousCount = 0;
  vacuousPatterns.forEach((pattern) => {
    vacuousCount += (content.match(pattern) || []).length;
  });

  const totalAssertions = (content.match(/expect\(/g) || []).length;
  if (totalAssertions === 0) return 1.0;

  return 1.0 - vacuousCount / totalAssertions;
}

function checkForBrittleTests(content) {
  const brittlePatterns = [
    /\.toHaveBeenCalledTimes\(/g, // Coupling to call count
    /toMatchSnapshot\(\)/g, // Snapshot tests can be brittle
  ];

  let brittleCount = 0;
  brittlePatterns.forEach((pattern) => {
    brittleCount += (content.match(pattern) || []).length;
  });

  const totalTests = (content.match(/it\(/g) || []).length;
  if (totalTests === 0) return 1.0;

  return Math.max(0, 1.0 - (brittleCount / totalTests) * 0.5);
}

function checkDeterminism(content) {
  const nonDeterministicPatterns = [
    /Math\.random\(\)/g,
    /Date\.now\(\)/g,
    /new Date\(\)/g,
    /fetch\(/g,
    /axios\./g,
  ];

  let issues = 0;
  nonDeterministicPatterns.forEach((pattern) => {
    const matches = content.match(pattern) || [];
    // Check if they're mocked
    const isMocked = content.includes('jest.mock') || content.includes('jest.spyOn');
    if (matches.length > 0 && !isMocked) {
      issues += matches.length;
    }
  });

  return issues === 0 ? 1.0 : Math.max(0, 1.0 - issues * 0.1);
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

  if (totalAssertions === 0) return 1.0;

  const documented = assertionsWithInlineMessages + assertionsWithComments;
  return Math.min(documented / totalAssertions, 1.0);
}

function checkIntegrationAuthenticity(content, filePath) {
  const isIntegrationTest =
    filePath.includes('integration') || filePath.includes('e2e');

  if (!isIntegrationTest) return 1.0; // Not applicable to unit tests

  // Check for inappropriate mocks in integration tests
  const mockPatterns = [
    /jest\.mock\(/g,
    /\.mockImplementation\(/g,
    /\.mockReturnValue\(/g,
  ];

  let mockCount = 0;
  mockPatterns.forEach((pattern) => {
    mockCount += (content.match(pattern) || []).length;
  });

  // Integration tests should have minimal mocking
  return mockCount === 0 ? 1.0 : Math.max(0, 1.0 - mockCount * 0.2);
}

function checkBoundaryAndNegativeCoverage(content) {
  const boundaryPatterns = [
    /toBe\(0\)/g,
    /toBe\(null\)/g,
    /toBe\(undefined\)/g,
    /toBeGreaterThan\(/g,
    /toBeLessThan\(/g,
    /toThrow/g,
    /expect.*\.rejects/g,
  ];

  let boundaryTestCount = 0;
  boundaryPatterns.forEach((pattern) => {
    boundaryTestCount += (content.match(pattern) || []).length;
  });

  const totalTests = (content.match(/it\(/g) || []).length;
  if (totalTests === 0) return 1.0;

  // At least 30% of tests should cover boundaries/negatives
  const ratio = boundaryTestCount / totalTests;
  return Math.min(ratio / 0.3, 1.0);
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

function collectIssues(scores) {
  const issues = [];

  Object.keys(QUALITY_DIMENSIONS).forEach((dimension) => {
    const threshold = QUALITY_DIMENSIONS[dimension].threshold;
    const score = scores[dimension];

    if (score < threshold) {
      issues.push({
        dimension,
        score: (score * 100).toFixed(1) + '%',
        threshold: (threshold * 100).toFixed(1) + '%',
        severity: score < threshold * 0.5 ? 'critical' : 'warning',
      });
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
          ? `<ul class="issues">${result.issues
              .map(
                (i) =>
                  `<li>${i.severity === 'critical' ? '🔴' : '🟡'} ${i.dimension}: ${i.score}</li>`,
              )
              .join('')}</ul>`
          : '<span class="no-issues">No issues</span>';

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
    .issues { margin: 0; padding-left: 20px; }
    .issues li { margin: 4px 0; }
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
    results.forEach((result) => {
      const status = result.passed ? '✅' : '❌';
      const relativePath = path.relative(process.cwd(), result.filePath);
      console.log(`${status} ${relativePath}: ${result.overallScore.toFixed(1)}%`);

      if (result.issues.length > 0) {
        result.issues.forEach((issue) => {
          const icon = issue.severity === 'critical' ? '   🔴' : '   🟡';
          console.log(`${icon} ${issue.dimension}: ${issue.score}`);
        });
      }
    });

    console.log(`\nTotal: ${results.length} files analyzed`);
    console.log(`Passed: ${results.filter((r) => r.passed).length}`);
    console.log(`Failed: ${results.filter((r) => !r.passed).length}`);

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

    console.log('\n=== Test Quality Analysis ===\n');
    console.log(`File: ${result.filePath}`);
    console.log(`Overall Score: ${result.overallScore.toFixed(1)}%`);
    console.log(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}\n`);

    if (result.issues.length > 0) {
      console.log('Issues Found:\n');
      result.issues.forEach((issue) => {
        const icon = issue.severity === 'critical' ? '🔴' : '🟡';
        console.log(
          `${icon} ${issue.dimension}: ${issue.score} (threshold: ${issue.threshold})`,
        );
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
