/**
 * Intent Interview Stochastic Runner
 *
 * Tier 2 evaluation: LLM-based interviewee (Haiku) answers interview
 * agent questions based on ground truth facts and persona. Each scenario
 * runs N times to capture variance. Results scored by rubric + precision/recall.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from '../../../common/llm/llm.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { NodeConfig } from '../graphs/nodes/types';
import { createInterviewGraph } from '../graphs/graphs/interview.graph';
import { InterviewGraphStateType } from '../graphs/types/interview-state';
import {
  StochasticScenario,
  loadStochasticScenario,
} from '../../../../test/fixtures/agents/intent-interview/stochastic-schema';
import { IntervieweeService, IntervieweeContext } from './interviewee.service';
import { scoreAgainstGroundTruth, GroundTruthScore } from './ground-truth-scorer';
import { scoreInterviewRubric, RubricResult } from './rubric-scorer';
import {
  EvaluationReport,
  EvaluationCaseResult,
  InterviewRunOutput,
  RunArtifact,
  RunMetrics,
} from './run-artifact.types';

// ============================================================================
// Types
// ============================================================================

export interface StochasticRunnerOptions {
  /** Directory containing stochastic scenario JSON files */
  scenariosDir: string;
  /** Specific scenario IDs to run (runs all if empty) */
  scenarioIds?: string[];
  /** Model for the interview agent (default: router decides) */
  model?: string;
  /** Temperature for the interview agent (default: 0) */
  temperature?: number;
}

interface SingleRunResult {
  runId: string;
  groundTruthScore: GroundTruthScore;
  rubricResult: RubricResult;
  output: InterviewRunOutput;
  durationMs: number;
  roundsCompleted: number;
  questionsAsked: number;
  errors: string[];
}

interface ScenarioAggregateStats {
  precision: { mean: number; stddev: number; min: number; max: number };
  recall: { mean: number; stddev: number; min: number; max: number };
  f1: { mean: number; stddev: number; min: number; max: number };
  rubricScore: { mean: number; stddev: number; min: number; max: number };
  questionsAsked: { mean: number; min: number; max: number };
  roundsCompleted: { mean: number; min: number; max: number };
  durationMs: { mean: number; min: number; max: number };
}

// ============================================================================
// Runner
// ============================================================================

const logger = new Logger('StochasticRunner');

/**
 * Create an LLM service proxy that disables caching.
 * Stochastic tests need fresh LLM responses on every run to measure variance.
 */
function createNoCacheLLMProxy(llmService: LLMService): LLMService {
  const proxy = Object.create(llmService) as LLMService;
  const originalInvoke = llmService.invoke.bind(llmService);
  proxy.invoke = (request: Parameters<LLMService['invoke']>[0]) => {
    return originalInvoke({ ...request, useCache: false });
  };
  return proxy;
}

/**
 * Run stochastic interview evaluation suite.
 */
export async function runInterviewStochastic(
  llmService: LLMService,
  toolRegistry: ToolRegistryService,
  options: StochasticRunnerOptions,
): Promise<EvaluationReport> {
  const startTime = new Date();
  const scenarios = loadScenarios(options.scenariosDir, options.scenarioIds);

  // Use non-caching proxy so each run gets fresh LLM responses
  const noCacheLlm = createNoCacheLLMProxy(llmService);
  const intervieweeService = new IntervieweeService(noCacheLlm);
  const cases: EvaluationCaseResult[] = [];

  logger.log(`Running ${scenarios.length} stochastic scenario(s)`);

  for (const scenario of scenarios) {
    const caseResult = await runScenario(
      noCacheLlm,
      toolRegistry,
      intervieweeService,
      scenario,
      options,
    );
    cases.push(caseResult);
  }

  const passedCases = cases.filter((c) => c.result === 'pass').length;
  const failedCases = cases.filter((c) => c.result === 'fail').length;
  const skippedCases = cases.filter((c) => c.result === 'skip').length;

  return {
    suite: 'golden', // Reuse existing suite type — stochastic is a variant
    agent: 'interview',
    timestamp: startTime.toISOString(),
    totalCases: cases.length,
    passedCases,
    failedCases,
    skippedCases,
    cases,
  };
}

/**
 * Run a single stochastic scenario (N independent runs).
 */
async function runScenario(
  llmService: LLMService,
  toolRegistry: ToolRegistryService,
  intervieweeService: IntervieweeService,
  scenario: StochasticScenario,
  options: StochasticRunnerOptions,
): Promise<EvaluationCaseResult> {
  logger.log(`Scenario ${scenario.id}: "${scenario.name}" — ${scenario.numRuns} run(s)`);

  const runResults: SingleRunResult[] = [];

  for (let i = 0; i < scenario.numRuns; i++) {
    try {
      const result = await executeSingleRun(
        llmService,
        toolRegistry,
        intervieweeService,
        scenario,
        i + 1,
        options,
      );
      runResults.push(result);
      logger.log(
        `  Run ${i + 1}/${scenario.numRuns}: P=${result.groundTruthScore.precision.toFixed(2)} ` +
          `R=${result.groundTruthScore.recall.toFixed(2)} F1=${result.groundTruthScore.f1.toFixed(2)} ` +
          `Rubric=${result.rubricResult.totalScore}/${result.rubricResult.maxScore}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`  Run ${i + 1}/${scenario.numRuns}: ERROR — ${message}`);
      runResults.push({
        runId: uuidv4(),
        groundTruthScore: {
          precision: 0,
          recall: 0,
          f1: 0,
          matches: [],
          unmatchedFacts: [],
          orphanAtoms: [],
        },
        rubricResult: {
          agent: 'interview',
          runId: '',
          totalScore: 0,
          maxScore: 12,
          passed: false,
          dimensions: [],
          criticalFailures: [],
          minimumScore: 0,
        },
        output: {
          atomCandidates: [],
          moleculeCandidates: [],
          questionsAsked: 0,
          roundsCompleted: 0,
          userSignaledDone: false,
          errors: [message],
        },
        durationMs: 0,
        roundsCompleted: 0,
        questionsAsked: 0,
        errors: [message],
      });
    }
  }

  // Aggregate stats
  const stats = aggregateStats(runResults);
  const passed = evaluateThresholds(stats, scenario);

  const reason = passed ? undefined : buildFailureReason(stats, scenario);

  return {
    caseId: scenario.id,
    name: scenario.name,
    result: passed ? 'pass' : 'fail',
    reason,
    diff: JSON.stringify(
      {
        runs: scenario.numRuns,
        aggregate: stats,
        perRun: runResults.map((r) => ({
          runId: r.runId,
          precision: r.groundTruthScore.precision,
          recall: r.groundTruthScore.recall,
          f1: r.groundTruthScore.f1,
          rubricScore: r.rubricResult.totalScore,
          questionsAsked: r.questionsAsked,
          rounds: r.roundsCompleted,
          unmatchedFacts: r.groundTruthScore.unmatchedFacts,
          orphanAtoms: r.groundTruthScore.orphanAtoms,
          errors: r.errors,
        })),
      },
      null,
      2,
    ),
  };
}

/**
 * Execute a single interview run with the stochastic interviewee.
 */
async function executeSingleRun(
  llmService: LLMService,
  toolRegistry: ToolRegistryService,
  intervieweeService: IntervieweeService,
  scenario: StochasticScenario,
  runNumber: number,
  options: StochasticRunnerOptions,
): Promise<SingleRunResult> {
  const runId = uuidv4();
  const maxRounds = scenario.maxRounds ?? 5;
  const startTime = Date.now();

  const intervieweeContext: IntervieweeContext = {
    domain: scenario.context.domain,
    constraints: scenario.context.constraints,
    persona: scenario.context.persona,
  };

  // Create the interviewee callback
  const intervieweeCallback: NonNullable<
    import('../graphs/nodes/interview/generate-questions.node').GenerateQuestionsNodeOptions['intervieweeCallback']
  > = async (questions, conversationHistory, round) => {
    return intervieweeService.respond(
      questions,
      scenario.groundTruth,
      scenario.persona,
      intervieweeContext,
      conversationHistory,
      round,
      maxRounds,
    );
  };

  // Create a fresh graph with the callback injected
  const nodeConfig: NodeConfig = {
    llmService,
    toolRegistry,
    logger: new Logger(`StochasticRun-${scenario.id}-${runNumber}`),
  };

  const graph = createInterviewGraph(nodeConfig, {
    nodeOptions: {
      generateQuestions: {
        intervieweeCallback,
      },
    },
  });

  // Invoke the graph
  const threadId = `stochastic-${scenario.id}-${runId}`;
  const result = (await graph.invoke(
    {
      rawIntent: scenario.initialIntent,
      maxRounds,
      scenarioContext: {
        domain: scenario.context.domain,
        constraints: scenario.context.constraints,
        persona: scenario.context.persona,
      },
    },
    {
      configurable: { thread_id: threadId },
      runName: `stochastic-${scenario.id}-run-${runNumber}`,
      tags: ['evaluation', 'stochastic', scenario.id],
    },
  )) as InterviewGraphStateType;

  const durationMs = Date.now() - startTime;

  // Extract output
  const output: InterviewRunOutput = {
    atomCandidates: (result.atomCandidates || []).map((a) => ({
      description: a.description,
      category: a.category,
      observableOutcomes: a.observableOutcomes,
      confidence: a.confidence,
      sourceEvidence: a.sourceEvidence,
    })),
    moleculeCandidates: (result.moleculeCandidates || []).map((m) => ({
      name: m.name,
      description: m.description,
      lensType: m.lensType,
      atomIndices: m.atomIndices,
    })),
    questionsAsked: (result.allQuestions || []).length,
    allQuestions: (result.allQuestions || []).map((q) => ({
      question: q.question,
      category: q.category,
      answered: q.answered,
      answerStatus: q.answerStatus,
      responseScope: q.responseScope,
    })),
    roundsCompleted: result.round || 0,
    userSignaledDone: result.userDone || false,
    completionReason: result.completionReason || undefined,
    errors: result.errors || [],
  };

  // Build a synthetic RunArtifact for rubric scoring
  const artifact: RunArtifact<'interview'> = {
    runId,
    agent: 'interview',
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    config: { model: options.model, temperature: options.temperature ?? 0 },
    input: {
      rawIntent: scenario.initialIntent,
      maxRounds,
    },
    inputHash: '',
    output,
    nodeTransitions: [],
    evidenceReferences: [],
    metrics: {
      totalDurationMs: durationMs,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalLlmCalls: result.llmCallCount || 0,
      totalToolCalls: 0,
      perNode: [],
    },
  };

  // Score
  const rubricResult = scoreInterviewRubric(artifact, scenario.evaluation.minimumRubricScore ?? 8);
  const groundTruthScore = scoreAgainstGroundTruth(
    result.atomCandidates || [],
    scenario.groundTruth,
  );

  return {
    runId,
    groundTruthScore,
    rubricResult,
    output,
    durationMs,
    roundsCompleted: result.round || 0,
    questionsAsked: (result.allQuestions || []).length,
    errors: result.errors || [],
  };
}

// ============================================================================
// Aggregation & Evaluation
// ============================================================================

function aggregateStats(runs: SingleRunResult[]): ScenarioAggregateStats {
  const precisions = runs.map((r) => r.groundTruthScore.precision);
  const recalls = runs.map((r) => r.groundTruthScore.recall);
  const f1s = runs.map((r) => r.groundTruthScore.f1);
  const rubrics = runs.map((r) => r.rubricResult.totalScore);
  const questions = runs.map((r) => r.questionsAsked);
  const rounds = runs.map((r) => r.roundsCompleted);
  const durations = runs.map((r) => r.durationMs);

  return {
    precision: computeDistribution(precisions),
    recall: computeDistribution(recalls),
    f1: computeDistribution(f1s),
    rubricScore: computeDistribution(rubrics),
    questionsAsked: {
      mean: mean(questions),
      min: Math.min(...questions),
      max: Math.max(...questions),
    },
    roundsCompleted: { mean: mean(rounds), min: Math.min(...rounds), max: Math.max(...rounds) },
    durationMs: { mean: mean(durations), min: Math.min(...durations), max: Math.max(...durations) },
  };
}

function evaluateThresholds(stats: ScenarioAggregateStats, scenario: StochasticScenario): boolean {
  if (stats.precision.mean < scenario.evaluation.minimumPrecision) return false;
  if (stats.recall.mean < scenario.evaluation.minimumRecall) return false;
  if (
    scenario.evaluation.minimumRubricScore &&
    stats.rubricScore.mean < scenario.evaluation.minimumRubricScore
  )
    return false;
  return true;
}

function buildFailureReason(stats: ScenarioAggregateStats, scenario: StochasticScenario): string {
  const reasons: string[] = [];
  if (stats.precision.mean < scenario.evaluation.minimumPrecision) {
    reasons.push(
      `precision ${stats.precision.mean.toFixed(2)} < ${scenario.evaluation.minimumPrecision}`,
    );
  }
  if (stats.recall.mean < scenario.evaluation.minimumRecall) {
    reasons.push(`recall ${stats.recall.mean.toFixed(2)} < ${scenario.evaluation.minimumRecall}`);
  }
  if (
    scenario.evaluation.minimumRubricScore &&
    stats.rubricScore.mean < scenario.evaluation.minimumRubricScore
  ) {
    reasons.push(
      `rubric ${stats.rubricScore.mean.toFixed(1)} < ${scenario.evaluation.minimumRubricScore}`,
    );
  }
  return `Mean thresholds not met: ${reasons.join(', ')}`;
}

// ============================================================================
// Helpers
// ============================================================================

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function computeDistribution(values: number[]): {
  mean: number;
  stddev: number;
  min: number;
  max: number;
} {
  return {
    mean: mean(values),
    stddev: stddev(values),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function loadScenarios(dir: string, scenarioIds?: string[]): StochasticScenario[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`Stochastic scenarios directory not found: ${dir}`);
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const scenarios: StochasticScenario[] = [];

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    const scenario = loadStochasticScenario(data);

    if (!scenarioIds || scenarioIds.length === 0 || scenarioIds.includes(scenario.id)) {
      scenarios.push(scenario);
    }
  }

  return scenarios;
}
