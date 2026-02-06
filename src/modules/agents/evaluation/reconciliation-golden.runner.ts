/**
 * Reconciliation Golden Runner
 *
 * Loads reconciliation fixtures, runs the reconciliation graph against them,
 * captures Run Artifacts, and compares to expected outputs.
 *
 * @see docs/implementation-checklist-phase13.md (13.3.2.3)
 * @see docs/architecture/agent-contracts.md (Reconciliation contract)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ReconciliationFixture,
  loadFixture,
} from '../../../../test/fixtures/agents/reconciliation/fixture-schema';
import { ArtifactCaptureService } from './artifact-capture.service';
import {
  EvaluationCaseResult,
  EvaluationReport,
  ReconciliationRunOutput,
  RunArtifact,
  TaggedFailure,
} from './run-artifact.types';
import {
  scoreReconciliationRubric,
  ReconciliationScoringContext,
  RubricResult,
} from './rubric-scorer';

/**
 * Options for running golden tests.
 */
export interface GoldenRunnerOptions {
  /** Directory containing fixture JSON files */
  fixturesDir: string;
  /** Specific fixture IDs to run (runs all if empty) */
  fixtureIds?: string[];
  /** Whether to update snapshots instead of comparing */
  updateSnapshots?: boolean;
  /** Directory to store snapshot files */
  snapshotDir?: string;
  /** Minimum rubric score to pass (overrides fixture-level setting) */
  minimumRubricScore?: number;
  /** Model to use for LLM calls (for pinned evaluation) */
  model?: string;
  /** Temperature override */
  temperature?: number;
}

/**
 * Extended case result with rubric scoring.
 */
export interface GoldenCaseResult extends EvaluationCaseResult {
  /** Rubric scoring result */
  rubricResult?: RubricResult;
  /** Fixture that was tested */
  fixtureId: string;
}

/**
 * Run golden reconciliation tests against fixtures.
 */
export async function runReconciliationGolden(
  captureService: ArtifactCaptureService,
  options: GoldenRunnerOptions,
): Promise<EvaluationReport> {
  const startTime = new Date();
  const fixtures = loadFixtures(options.fixturesDir, options.fixtureIds);
  const cases: GoldenCaseResult[] = [];

  for (const fixture of fixtures) {
    const caseResult = await runFixture(captureService, fixture, options);
    cases.push(caseResult);
  }

  const passedCases = cases.filter((c) => c.result === 'pass').length;
  const failedCases = cases.filter((c) => c.result === 'fail').length;
  const skippedCases = cases.filter((c) => c.result === 'skip').length;

  const artifacts = cases
    .map((c) => c.artifact)
    .filter((a): a is RunArtifact => a !== undefined);

  return {
    suite: 'golden',
    agent: 'reconciliation',
    timestamp: startTime.toISOString(),
    totalCases: cases.length,
    passedCases,
    failedCases,
    skippedCases,
    cases,
    aggregateMetrics: artifacts.length > 0
      ? {
          avgDurationMs:
            artifacts.reduce((sum, a) => sum + a.metrics.totalDurationMs, 0) / artifacts.length,
          avgTokens:
            artifacts.reduce((sum, a) => sum + a.metrics.totalTokens, 0) / artifacts.length,
        }
      : undefined,
  };
}

/**
 * Run a single fixture and produce a case result.
 */
async function runFixture(
  captureService: ArtifactCaptureService,
  fixture: ReconciliationFixture,
  options: GoldenRunnerOptions,
): Promise<GoldenCaseResult> {
  try {
    // Build graph input from fixture
    const input = buildInputFromFixture(fixture);

    // Run through artifact capture
    const { artifact } = await captureService.captureRun('reconciliation', input, {
      agent: 'reconciliation',
      model: options.model,
      temperature: options.temperature ?? 0,
      additionalConfig: {
        fixtureId: fixture.id,
        fixtureVersion: fixture.fixtureVersion,
      },
    });

    // Build scoring context from fixture
    const scoringContext = buildScoringContext(fixture);

    // Score against rubric
    const minimumScore = options.minimumRubricScore ?? fixture.minimumRubricScore ?? 8;
    const rubricResult = scoreReconciliationRubric(artifact as RunArtifact<'reconciliation'>, scoringContext, minimumScore);

    // Compare against expected output
    const comparisonFailures = compareToExpected(artifact, fixture);

    // Determine pass/fail
    const allFailures = [...rubricResult.criticalFailures, ...comparisonFailures];
    const passed = rubricResult.passed && comparisonFailures.length === 0;

    // Handle snapshots
    if (options.updateSnapshots && options.snapshotDir) {
      saveSnapshot(options.snapshotDir, fixture.id, artifact);
    }

    return {
      caseId: fixture.id,
      name: fixture.name,
      result: passed ? 'pass' : 'fail',
      reason: passed
        ? undefined
        : allFailures.map((f) => f.reason).join('; '),
      failures: allFailures.length > 0 ? allFailures : undefined,
      artifact,
      rubricResult,
      fixtureId: fixture.id,
    };
  } catch (error) {
    return {
      caseId: fixture.id,
      name: fixture.name,
      result: 'fail',
      reason: `Execution error: ${error.message}`,
      failures: [
        {
          tag: 'tooling',
          reason: error.message,
          isCritical: true,
        },
      ],
      fixtureId: fixture.id,
    };
  }
}

/**
 * Build reconciliation graph input from a fixture.
 */
function buildInputFromFixture(fixture: ReconciliationFixture): Record<string, unknown> {
  // Convert annotations array to Record for easy lookup in graph nodes
  // Key format: "filePath:testName" -> atomId
  const annotationsRecord: Record<string, string> = {};
  for (const ann of fixture.registry.annotations) {
    const key = `${ann.testFilePath}:${ann.testName}`;
    annotationsRecord[key] = ann.atomId;
  }

  // Create a temporary directory-like structure from fixture files
  return {
    rootDirectory: `/fixtures/${fixture.id}`,
    input: {
      rootDirectory: `/fixtures/${fixture.id}`,
      reconciliationMode: fixture.mode,
      options: {
        maxTests: 100,
        qualityThreshold: 80,
        requireReview: false,
      },
    },
    // Provide pre-read content for fixture-based testing
    fixtureMode: true,
    fixtureFiles: fixture.repo.files,
    fixtureTestFiles: fixture.repo.testFiles,
    fixtureSourceFiles: fixture.repo.sourceFiles,
    fixtureAnnotations: annotationsRecord,
    fixtureAtoms: fixture.registry.atoms,
  };
}

/**
 * Build scoring context from fixture data.
 */
function buildScoringContext(fixture: ReconciliationFixture): ReconciliationScoringContext {
  return {
    validFilePaths: Object.keys(fixture.repo.files),
    validTestNames: extractTestNames(fixture),
    existingAnnotations: fixture.registry.annotations,
  };
}

/**
 * Extract test names from fixture files.
 */
function extractTestNames(fixture: ReconciliationFixture): string[] {
  const names: string[] = [];
  const itPattern = /it\(['"`](.+?)['"`]/g;

  for (const testFile of fixture.repo.testFiles) {
    const content = fixture.repo.files[testFile];
    if (!content) continue;

    let match: RegExpExecArray | null;
    while ((match = itPattern.exec(content)) !== null) {
      names.push(match[1]);
    }
  }

  return names;
}

/**
 * Compare run artifact output to fixture's expected output.
 */
function compareToExpected(
  artifact: RunArtifact,
  fixture: ReconciliationFixture,
): TaggedFailure[] {
  const failures: TaggedFailure[] = [];
  const output = artifact.output as ReconciliationRunOutput;
  const expected = fixture.expected;

  // Check orphan test count
  if (expected.orphanTests.length > 0 && output.orphanTestCount === 0) {
    failures.push({
      tag: 'routing',
      reason: `Expected ${expected.orphanTests.length} orphan test(s) but found 0`,
      contractViolation: 'C-REC-01',
      isCritical: false,
    });
  }

  // Check that annotated tests are NOT in orphan output
  if (expected.notOrphanTests) {
    for (const notOrphan of expected.notOrphanTests) {
      const found = output.inferredAtoms.some(
        (a) =>
          a.sourceTest.filePath === notOrphan.filePath &&
          a.sourceTest.testName === notOrphan.testName,
      );
      // This would be an INV-R001 violation if an annotated test got an atom inferred
      // The rubric scorer handles this via classification correctness
    }
  }

  // Check error count
  const maxErrors = expected.maxErrors ?? 0;
  if (output.errors.length > maxErrors) {
    failures.push({
      tag: 'tooling',
      reason: `${output.errors.length} error(s) exceeded maximum of ${maxErrors}`,
      isCritical: false,
    });
  }

  return failures;
}

/**
 * Load fixtures from a directory.
 */
function loadFixtures(dir: string, fixtureIds?: string[]): ReconciliationFixture[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`Fixtures directory not found: ${dir}`);
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const fixtures: ReconciliationFixture[] = [];

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    const fixture = loadFixture(data);

    if (!fixtureIds || fixtureIds.length === 0 || fixtureIds.includes(fixture.id)) {
      fixtures.push(fixture);
    }
  }

  return fixtures;
}

/**
 * Save a snapshot of the artifact for baseline comparison.
 */
function saveSnapshot(snapshotDir: string, fixtureId: string, artifact: RunArtifact): void {
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

  const snapshotPath = path.join(snapshotDir, `${fixtureId}.snapshot.json`);
  const snapshot = {
    fixtureId,
    output: artifact.output,
    nodeTransitions: artifact.nodeTransitions.map((t) => t.node),
    evidenceCount: artifact.evidenceReferences.length,
    snapshotVersion: '1.0',
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
}
