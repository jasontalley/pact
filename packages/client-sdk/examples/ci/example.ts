/**
 * CI/CD Pipeline Example
 *
 * Demonstrates how to integrate Pact into a CI/CD pipeline.
 * This is the PRIMARY PROMOTION GATE — the only path from plausible to canonical truth.
 *
 * CI-attested runs:
 * 1. Read local files and coverage data
 * 2. Submit to Pact server with CI attestation
 * 3. Server updates canonical epistemic state
 * 4. Pipeline fails on quality issues or convergence violations
 *
 * Example: GitHub Actions workflow
 */

// Use relative import for development; published package uses '@pact/client-sdk'
import { PactClient } from '../../src';

// CI environment detection
interface CIEnvironment {
  isCI: boolean;
  provider: 'github' | 'gitlab' | 'jenkins' | 'circleci' | 'unknown';
  buildId?: string;
  buildUrl?: string;
  branch?: string;
  commitHash?: string;
  pullRequestNumber?: string;
}

function detectCIEnvironment(): CIEnvironment {
  // GitHub Actions
  if (process.env.GITHUB_ACTIONS) {
    return {
      isCI: true,
      provider: 'github',
      buildId: process.env.GITHUB_RUN_ID,
      buildUrl: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
      branch: process.env.GITHUB_REF_NAME,
      commitHash: process.env.GITHUB_SHA,
      pullRequestNumber: process.env.GITHUB_EVENT_NAME === 'pull_request'
        ? process.env.GITHUB_REF?.split('/')[2]
        : undefined,
    };
  }

  // GitLab CI
  if (process.env.GITLAB_CI) {
    return {
      isCI: true,
      provider: 'gitlab',
      buildId: process.env.CI_JOB_ID,
      buildUrl: process.env.CI_JOB_URL,
      branch: process.env.CI_COMMIT_REF_NAME,
      commitHash: process.env.CI_COMMIT_SHA,
      pullRequestNumber: process.env.CI_MERGE_REQUEST_IID,
    };
  }

  // Jenkins
  if (process.env.JENKINS_URL) {
    return {
      isCI: true,
      provider: 'jenkins',
      buildId: process.env.BUILD_ID,
      buildUrl: process.env.BUILD_URL,
      branch: process.env.GIT_BRANCH,
      commitHash: process.env.GIT_COMMIT,
    };
  }

  // CircleCI
  if (process.env.CIRCLECI) {
    return {
      isCI: true,
      provider: 'circleci',
      buildId: process.env.CIRCLE_BUILD_NUM,
      buildUrl: process.env.CIRCLE_BUILD_URL,
      branch: process.env.CIRCLE_BRANCH,
      commitHash: process.env.CIRCLE_SHA1,
      pullRequestNumber: process.env.CIRCLE_PR_NUMBER,
    };
  }

  // Generic CI detection
  if (process.env.CI) {
    return {
      isCI: true,
      provider: 'unknown',
    };
  }

  return {
    isCI: false,
    provider: 'unknown',
  };
}

/**
 * Main CI reconciliation step
 *
 * This is the canonical promotion path:
 * - Reads project files
 * - Collects test coverage data
 * - Submits CI-attested reconciliation run
 * - Returns exit code based on results
 */
export async function runCIReconciliation(options: {
  serverUrl: string;
  projectRoot: string;
  projectId?: string;
  authToken?: string;
  coveragePath?: string;
  failOnOrphanTests?: boolean;
  minAtomCoverage?: number;
}): Promise<number> {
  const ci = detectCIEnvironment();

  if (!ci.isCI) {
    console.error('ERROR: This script must run in a CI environment');
    console.error('CI-attested reconciliation is the only path to canonical truth.');
    console.error('For local checks, use: pact check');
    return 1;
  }

  console.log('='.repeat(60));
  console.log('Pact CI Reconciliation');
  console.log('='.repeat(60));
  console.log(`Provider:    ${ci.provider}`);
  console.log(`Build ID:    ${ci.buildId || 'N/A'}`);
  console.log(`Branch:      ${ci.branch || 'N/A'}`);
  console.log(`Commit:      ${ci.commitHash || 'N/A'}`);
  console.log(`Server:      ${options.serverUrl}`);
  console.log('='.repeat(60));
  console.log('');

  const client = new PactClient({
    serverUrl: options.serverUrl,
    projectRoot: options.projectRoot,
    projectId: options.projectId,
    authToken: options.authToken,
  });

  try {
    // Step 1: Read project files
    console.log('[1/4] Reading project files...');
    const content = await client.readForReconciliation({
      includeSourceFiles: true,
      includeDocs: true,
    });
    console.log(`      Found ${Object.keys(content.fileContents).length} files`);

    // Step 2: Collect coverage data (if available)
    console.log('[2/4] Collecting coverage data...');
    let coverageData = null;
    try {
      if (options.coveragePath) {
        coverageData = await client.coverage.collectFromFile(options.coveragePath);
      } else {
        coverageData = await client.coverage.collectFromDefaults();
      }
      if (coverageData) {
        console.log(`      Coverage data collected (${coverageData.format})`);
        console.log(`      Lines: ${coverageData.lines}%, Branches: ${coverageData.branches}%`);
      }
    } catch {
      console.log('      No coverage data found (optional)');
    }

    // Step 3: Submit reconciliation run
    console.log('[3/4] Submitting reconciliation run...');
    const runStart = await client.api.submitPreReadContent(content);
    console.log(`      Run ID: ${runStart.runId}`);
    console.log(`      Status: ${runStart.status}`);

    // Step 4: Wait for completion and evaluate results
    console.log('[4/4] Waiting for analysis to complete...');
    const result = await client.api.waitForCompletion(runStart.runId);

    console.log('');
    console.log('='.repeat(60));
    console.log('Results');
    console.log('='.repeat(60));

    if (result.status === 'failed') {
      console.error('Analysis failed');
      return 1;
    }

    // Print summary
    console.log(`Status:             ${result.status}`);
    console.log(`Duration:           ${result.durationMs}ms`);
    console.log(`Atom Recommendations: ${result.atomRecommendations.length}`);
    console.log(`Molecule Recommendations: ${result.moleculeRecommendations.length}`);
    console.log(`Orphan Tests:       ${result.orphanTests.length}`);

    // Evaluate pass/fail criteria
    let exitCode = 0;
    const issues: string[] = [];

    // Check orphan tests
    if (options.failOnOrphanTests && result.orphanTests.length > 0) {
      issues.push(`${result.orphanTests.length} orphan tests found (no atom linkage)`);
    }

    // Show orphan tests
    if (result.orphanTests.length > 0) {
      console.log('\nOrphan Tests:');
      for (const test of result.orphanTests.slice(0, 10)) {
        console.log(`  - ${test}`);
      }
      if (result.orphanTests.length > 10) {
        console.log(`  ... and ${result.orphanTests.length - 10} more`);
      }
    }

    // Show recommendations
    if (result.atomRecommendations.length > 0) {
      console.log('\nNew Atom Recommendations:');
      for (const rec of result.atomRecommendations.slice(0, 5)) {
        console.log(`  - [${rec.category}] ${rec.description.substring(0, 60)}...`);
        console.log(`    Confidence: ${(rec.confidence * 100).toFixed(0)}%`);
      }
      if (result.atomRecommendations.length > 5) {
        console.log(`  ... and ${result.atomRecommendations.length - 5} more`);
      }
    }

    console.log('');
    if (issues.length > 0) {
      console.log('FAILED - Convergence policy violations:');
      for (const issue of issues) {
        console.log(`  - ${issue}`);
      }
      exitCode = 1;
    } else {
      console.log('PASSED - All convergence policies satisfied');

      // Auto-commit high-confidence recommendations
      const autoCommit = result.atomRecommendations.filter(r => r.autoCommit);
      if (autoCommit.length > 0) {
        console.log(`\nAuto-committing ${autoCommit.length} high-confidence atoms...`);
        try {
          const applied = await client.api.applyRecommendations(
            runStart.runId,
            autoCommit.map(r => r.tempId)
          );
          console.log(`  Applied ${applied.applied} atoms: ${applied.atomIds.join(', ')}`);
        } catch (error) {
          console.log(`  Warning: Failed to auto-commit: ${error}`);
        }
      }
    }

    console.log('='.repeat(60));
    return exitCode;
  } catch (error) {
    console.error('');
    console.error('ERROR:', error instanceof Error ? error.message : error);
    return 1;
  }
}

/**
 * GitHub Actions workflow example
 *
 * .github/workflows/pact.yml:
 * ```yaml
 * name: Pact Reconciliation
 *
 * on:
 *   push:
 *     branches: [main, develop]
 *   pull_request:
 *     branches: [main, develop]
 *
 * jobs:
 *   reconcile:
 *     runs-on: ubuntu-latest
 *     steps:
 *       - uses: actions/checkout@v4
 *
 *       - uses: actions/setup-node@v4
 *         with:
 *           node-version: '20'
 *
 *       - run: npm ci
 *
 *       - name: Run tests with coverage
 *         run: npm test -- --coverage
 *
 *       - name: Pact Reconciliation
 *         run: npx ts-node packages/client-sdk/examples/ci/example.ts
 *         env:
 *           PACT_SERVER_URL: ${{ secrets.PACT_SERVER_URL }}
 *           PACT_PROJECT_ID: ${{ secrets.PACT_PROJECT_ID }}
 *           PACT_AUTH_TOKEN: ${{ secrets.PACT_AUTH_TOKEN }}
 * ```
 */

// Entry point
if (require.main === module) {
  const options = {
    serverUrl: process.env.PACT_SERVER_URL || 'http://localhost:3000',
    projectRoot: process.cwd(),
    projectId: process.env.PACT_PROJECT_ID,
    authToken: process.env.PACT_AUTH_TOKEN,
    coveragePath: process.env.PACT_COVERAGE_PATH,
    failOnOrphanTests: process.env.PACT_FAIL_ON_ORPHAN !== 'false',
    minAtomCoverage: process.env.PACT_MIN_COVERAGE
      ? parseFloat(process.env.PACT_MIN_COVERAGE) / 100
      : undefined,
  };

  runCIReconciliation(options).then(process.exit);
}

export { detectCIEnvironment };
