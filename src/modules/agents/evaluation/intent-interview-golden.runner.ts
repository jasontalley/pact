/**
 * Intent Interview Golden Runner
 *
 * Loads interview scenarios, runs the interview graph against them,
 * captures Run Artifacts, and compares to expected outputs.
 *
 * @see docs/implementation-checklist-phase13.md (13.3.1.3)
 * @see docs/architecture/agent-contracts.md (Intent Interview contract)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  IntentInterviewScenario,
  loadScenario,
} from '../../../../test/fixtures/agents/intent-interview/scenario-schema';
import { ArtifactCaptureService } from './artifact-capture.service';
import {
  EvaluationCaseResult,
  EvaluationReport,
  InterviewRunOutput,
  RunArtifact,
  TaggedFailure,
} from './run-artifact.types';
import { scoreInterviewRubric, RubricResult } from './rubric-scorer';

/**
 * Options for running golden interview tests.
 */
export interface InterviewGoldenRunnerOptions {
  /** Directory containing scenario JSON files */
  scenariosDir: string;
  /** Specific scenario IDs to run (runs all if empty) */
  scenarioIds?: string[];
  /** Whether to update snapshots instead of comparing */
  updateSnapshots?: boolean;
  /** Directory to store snapshot files */
  snapshotDir?: string;
  /** Minimum rubric score to pass (overrides scenario-level setting) */
  minimumRubricScore?: number;
  /** Model to use for LLM calls */
  model?: string;
  /** Temperature override */
  temperature?: number;
}

/**
 * Extended case result with rubric scoring.
 */
export interface InterviewGoldenCaseResult extends EvaluationCaseResult {
  /** Rubric scoring result */
  rubricResult?: RubricResult;
  /** Scenario that was tested */
  scenarioId: string;
}

/**
 * Run golden interview tests against scenarios.
 */
export async function runInterviewGolden(
  captureService: ArtifactCaptureService,
  options: InterviewGoldenRunnerOptions,
): Promise<EvaluationReport> {
  const startTime = new Date();
  const scenarios = loadScenarios(options.scenariosDir, options.scenarioIds);
  const cases: InterviewGoldenCaseResult[] = [];

  for (const scenario of scenarios) {
    const caseResult = await runScenario(captureService, scenario, options);
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
    agent: 'interview',
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
 * Run a single scenario and produce a case result.
 */
async function runScenario(
  captureService: ArtifactCaptureService,
  scenario: IntentInterviewScenario,
  options: InterviewGoldenRunnerOptions,
): Promise<InterviewGoldenCaseResult> {
  try {
    // Build interview graph input from scenario
    const input = buildInputFromScenario(scenario);

    // Run through artifact capture
    const { artifact } = await captureService.captureRun('interview', input, {
      agent: 'interview',
      model: options.model,
      temperature: options.temperature ?? 0,
      additionalConfig: {
        scenarioId: scenario.id,
        scenarioVersion: scenario.scenarioVersion,
        domain: scenario.context.domain,
      },
    });

    // Score against rubric
    const minimumScore = options.minimumRubricScore ?? scenario.minimumRubricScore ?? 8;
    const rubricResult = scoreInterviewRubric(
      artifact as RunArtifact<'interview'>,
      minimumScore,
    );

    // Compare against expected output
    const comparisonFailures = compareToExpected(artifact, scenario);

    // Determine pass/fail
    const allFailures = [...rubricResult.criticalFailures, ...comparisonFailures];
    const passed = rubricResult.passed && comparisonFailures.length === 0;

    // Handle snapshots
    if (options.updateSnapshots && options.snapshotDir) {
      saveSnapshot(options.snapshotDir, scenario.id, artifact);
    }

    return {
      caseId: scenario.id,
      name: scenario.name,
      result: passed ? 'pass' : 'fail',
      reason: passed ? undefined : allFailures.map((f) => f.reason).join('; '),
      failures: allFailures.length > 0 ? allFailures : undefined,
      artifact,
      rubricResult,
      scenarioId: scenario.id,
    };
  } catch (error) {
    return {
      caseId: scenario.id,
      name: scenario.name,
      result: 'fail',
      reason: `Execution error: ${error.message}`,
      failures: [
        {
          tag: 'tooling',
          reason: error.message,
          isCritical: true,
        },
      ],
      scenarioId: scenario.id,
    };
  }
}

/**
 * Build interview graph input from a scenario.
 */
function buildInputFromScenario(scenario: IntentInterviewScenario): Record<string, unknown> {
  // Provide the first user message as the raw intent
  const firstMessage = scenario.userMessages[0];

  // Build simulated responses from subsequent user messages
  const simulatedResponses = scenario.userMessages.slice(1).map((m) => ({
    content: m.content,
    signalsDone: m.signalsDone || false,
  }));

  // If no subsequent messages, create a "done" signal to allow extraction
  if (simulatedResponses.length === 0) {
    simulatedResponses.push({
      content: 'That covers what I need.',
      signalsDone: true,
    });
  }

  return {
    rawIntent: firstMessage?.content || '',
    maxRounds: 5,
    // Provide remaining messages as simulated conversation
    simulatedResponses,
    // Reset the index for each scenario run
    simulatedResponseIndex: 0,
    // Context for the agent (mapped to scenarioContext in state)
    scenarioContext: scenario.context,
  };
}

/**
 * Compare run artifact output to scenario's expected output.
 */
function compareToExpected(
  artifact: RunArtifact,
  scenario: IntentInterviewScenario,
): TaggedFailure[] {
  const failures: TaggedFailure[] = [];
  const output = artifact.output as InterviewRunOutput;

  // Check minimum atom count
  if (output.atomCandidates.length < scenario.expectedAtoms.length) {
    failures.push({
      tag: 'model',
      reason: `Expected at least ${scenario.expectedAtoms.length} atom(s) but got ${output.atomCandidates.length}`,
      isCritical: false,
    });
  }

  // Check each expected atom has a structural match
  for (const expected of scenario.expectedAtoms) {
    const match = output.atomCandidates.find((atom) => {
      const descMatch = matchDescription(atom.description, expected);
      const catMatch = matchCategory(atom.category, expected);
      const outcomesMatch = atom.observableOutcomes.length >= expected.minOutcomes;
      const confMatch = !expected.minConfidence || atom.confidence >= expected.minConfidence;
      const evidenceMatch =
        !expected.requiresEvidence || atom.sourceEvidence.length > 0;

      return descMatch && catMatch && outcomesMatch && confMatch && evidenceMatch;
    });

    if (!match) {
      const descLabel = getDescriptionLabel(expected);
      const catLabel = getCategoryLabel(expected);
      const diagnostic = buildMatchDiagnostic(output.atomCandidates, expected);
      failures.push({
        tag: 'model',
        reason: `No atom matching: ${descLabel} (${catLabel})${diagnostic}`,
        contractViolation: 'C-INT-01',
        isCritical: false,
      });
    }
  }

  // Check for expected non-goals (things the agent should NOT assume)
  if (scenario.expectedNonGoals) {
    for (const nonGoal of scenario.expectedNonGoals) {
      const violated = output.atomCandidates.some((atom) =>
        atom.description.toLowerCase().includes(nonGoal.toLowerCase()),
      );
      if (violated) {
        failures.push({
          tag: 'prompt',
          reason: `Agent assumed non-goal: "${nonGoal}"`,
          contractViolation: 'C-INT-03',
          isCritical: false,
        });
      }
    }
  }

  return failures;
}

/**
 * Check if an atom description matches the expected pattern.
 * Supports both `descriptionContains` (single) and `descriptionContainsAny` (multi).
 */
function matchDescription(
  description: string,
  expected: import('../../../../test/fixtures/agents/intent-interview/scenario-schema').ExpectedAtom,
): boolean {
  const desc = description.toLowerCase();

  // Multi-pattern: match if ANY substring is found
  if (expected.descriptionContainsAny && expected.descriptionContainsAny.length > 0) {
    return expected.descriptionContainsAny.some((pattern) =>
      desc.includes(pattern.toLowerCase()),
    );
  }

  // Single pattern (backward compat)
  if (expected.descriptionContains) {
    return desc.includes(expected.descriptionContains.toLowerCase());
  }

  // No description constraint — match any
  return true;
}

/**
 * Check if an atom category matches the expected category.
 * Supports both `category` (exact) and `categoryOneOf` (multi).
 */
function matchCategory(
  category: string,
  expected: import('../../../../test/fixtures/agents/intent-interview/scenario-schema').ExpectedAtom,
): boolean {
  // Multi-category: match if any category matches
  if (expected.categoryOneOf && expected.categoryOneOf.length > 0) {
    return expected.categoryOneOf.includes(category as 'functional' | 'performance' | 'security' | 'ux' | 'operational');
  }

  // Single category (backward compat)
  if (expected.category) {
    return category === expected.category;
  }

  // No category constraint — match any
  return true;
}

/**
 * Get a human-readable description label for failure messages.
 */
function getDescriptionLabel(
  expected: import('../../../../test/fixtures/agents/intent-interview/scenario-schema').ExpectedAtom,
): string {
  if (expected.descriptionContainsAny) {
    return `"${expected.descriptionContainsAny.join('" | "')}"`;
  }
  return `"${expected.descriptionContains || '(any)'}"`;
}

/**
 * Get a human-readable category label for failure messages.
 */
function getCategoryLabel(
  expected: import('../../../../test/fixtures/agents/intent-interview/scenario-schema').ExpectedAtom,
): string {
  if (expected.categoryOneOf) {
    return expected.categoryOneOf.join('|');
  }
  return expected.category || '(any)';
}

/**
 * Score a single atom against an expected pattern, returning pass/fail per criterion.
 */
function scoreAtomMatch(
  atom: InterviewRunOutput['atomCandidates'][0],
  expected: import('../../../../test/fixtures/agents/intent-interview/scenario-schema').ExpectedAtom,
): { score: number; failures: string[] } {
  const checks = [
    { ok: matchDescription(atom.description, expected), fail: 'desc:FAIL' },
    { ok: matchCategory(atom.category, expected), fail: `cat:FAIL(${atom.category})` },
    { ok: atom.observableOutcomes.length >= expected.minOutcomes, fail: `outcomes:FAIL(${atom.observableOutcomes.length})` },
    { ok: !expected.minConfidence || atom.confidence >= expected.minConfidence, fail: `conf:FAIL(${atom.confidence})` },
    { ok: !expected.requiresEvidence || atom.sourceEvidence.length > 0, fail: `evidence:FAIL(${atom.sourceEvidence.length})` },
  ];

  const failures = checks.filter((c) => !c.ok).map((c) => c.fail);
  return { score: checks.length - failures.length, failures };
}

/**
 * Build a diagnostic string showing the closest matching atom for debugging.
 */
function buildMatchDiagnostic(
  atoms: InterviewRunOutput['atomCandidates'],
  expected: import('../../../../test/fixtures/agents/intent-interview/scenario-schema').ExpectedAtom,
): string {
  if (atoms.length === 0) return ' [no atoms extracted]';

  let bestScore = 0;
  let bestAtom: (typeof atoms)[0] | null = null;
  let bestFailures: string[] = [];

  for (const atom of atoms) {
    const result = scoreAtomMatch(atom, expected);
    if (result.score > bestScore) {
      bestScore = result.score;
      bestAtom = atom;
      bestFailures = result.failures;
    }
  }

  if (!bestAtom) return '';

  const truncDesc =
    bestAtom.description.length > 60
      ? bestAtom.description.substring(0, 60) + '...'
      : bestAtom.description;

  return ` [closest(${bestScore}/5): "${truncDesc}" — ${bestFailures.join(', ')}]`;
}

/**
 * Load scenarios from a directory.
 */
function loadScenarios(dir: string, scenarioIds?: string[]): IntentInterviewScenario[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`Scenarios directory not found: ${dir}`);
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const scenarios: IntentInterviewScenario[] = [];

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    const scenario = loadScenario(data);

    if (!scenarioIds || scenarioIds.length === 0 || scenarioIds.includes(scenario.id)) {
      scenarios.push(scenario);
    }
  }

  return scenarios;
}

/**
 * Save a snapshot of the artifact for baseline comparison.
 */
function saveSnapshot(snapshotDir: string, scenarioId: string, artifact: RunArtifact): void {
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

  const snapshotPath = path.join(snapshotDir, `${scenarioId}.snapshot.json`);
  const snapshot = {
    scenarioId,
    output: artifact.output,
    nodeTransitions: artifact.nodeTransitions.map((t) => t.node),
    snapshotVersion: '1.0',
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
}
