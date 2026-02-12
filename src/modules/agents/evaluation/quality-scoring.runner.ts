/**
 * Quality Scoring Runner
 *
 * Tests the verify node's quality evaluation prompt in isolation
 * with known-good and known-bad atoms. Validates that quality scores
 * fall within expected ranges and that JSON parsing succeeds.
 *
 * Uses the same prompt as buildBatchQualityPrompt() in verify.node.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LLMService } from '../../../common/llm/llm.service';
import { parseJsonWithRecovery } from '../../../common/llm/json-recovery';
import {
  QualityScoringFixture,
  QualityScoringResult,
} from '../../../../test/fixtures/agents/quality-scoring/quality-scoring-schema';
import {
  EvaluationReport,
  EvaluationCaseResult,
} from './run-artifact.types';

/** Quality threshold used by verify node */
const QUALITY_THRESHOLD = 80;

/**
 * Build the quality evaluation prompt — mirrors buildBatchQualityPrompt()
 * in verify.node.ts. Must stay in sync.
 */
function buildQualityPrompt(fixture: QualityScoringFixture): string {
  const atom = fixture.atom;
  return (
    `Validate the quality of this intent atom and respond with JSON:\n` +
    `Description: ${atom.description}\n` +
    `Category: ${atom.category || 'unspecified'}\n` +
    `Observable Outcomes: ${JSON.stringify(atom.observableOutcomes || [])}\n` +
    `Confidence: ${atom.confidence}\n` +
    `Reasoning: ${atom.reasoning || 'none'}\n\n` +
    `Respond ONLY with: {"totalScore": <0-100>, "decision": "approve"|"revise"|"reject", "feedback": "<brief>"}`
  );
}

/**
 * Load fixtures from the fixtures directory.
 */
function loadFixtures(
  fixturesDir: string,
  fixtureIds?: string[],
): QualityScoringFixture[] {
  const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
  const fixtures: QualityScoringFixture[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(fixturesDir, file), 'utf-8');
    const fixture = JSON.parse(content) as QualityScoringFixture;
    if (!fixtureIds || fixtureIds.includes(fixture.id)) {
      fixtures.push(fixture);
    }
  }

  return fixtures.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Run the quality-scoring evaluation suite.
 *
 * @param llmService - LLM service instance
 * @param options - Runner options
 * @returns EvaluationReport
 */
export async function runQualityScoring(
  llmService: LLMService,
  options: {
    fixturesDir?: string;
    fixtureIds?: string[];
    model?: string;
    temperature?: number;
  } = {},
): Promise<EvaluationReport> {
  const fixturesDir =
    options.fixturesDir ||
    path.resolve(__dirname, '../../../../test/fixtures/agents/quality-scoring/fixtures');

  const fixtures = loadFixtures(fixturesDir, options.fixtureIds);
  const results: QualityScoringResult[] = [];

  console.log(`Running ${fixtures.length} quality-scoring fixtures...`);

  let jsonParseSuccessCount = 0;

  for (const fixture of fixtures) {
    const startMs = Date.now();

    try {
      const response = await llmService.invoke({
        messages: [
          { role: 'user', content: buildQualityPrompt(fixture) },
        ],
        agentName: 'quality-scoring-eval',
        purpose: `Evaluate fixture ${fixture.id}`,
        temperature: options.temperature ?? 0,
        ...(options.model ? { preferredModel: options.model } : {}),
      });

      const parsed = parseJsonWithRecovery(response.content) as Record<string, unknown> | null;
      const durationMs = Date.now() - startMs;
      const failureReasons: string[] = [];

      const jsonParseSuccess = parsed !== null && typeof parsed.totalScore === 'number';
      if (jsonParseSuccess) jsonParseSuccessCount++;

      if (!jsonParseSuccess) {
        results.push({
          fixtureId: fixture.id,
          fixtureName: fixture.name,
          actualScore: null,
          scoreInRange: false,
          passFailMatches: false,
          jsonParseSuccess: false,
          passed: false,
          rawResponse: parsed,
          durationMs,
          failureReasons: ['JSON parse failed or missing totalScore'],
        });
        console.log(`  FAIL: ${fixture.id} — ${fixture.name} (JSON parse failure, ${durationMs}ms)`);
        continue;
      }

      const actualScore = parsed.totalScore as number;
      const expected = fixture.expectedScore;

      // Check score range
      const aboveMin = actualScore >= expected.minScore;
      const belowMax = expected.maxScore === undefined || actualScore <= expected.maxScore;
      const scoreInRange = aboveMin && belowMax;
      if (!scoreInRange) {
        const range = expected.maxScore !== undefined
          ? `${expected.minScore}-${expected.maxScore}`
          : `>=${expected.minScore}`;
        failureReasons.push(`Score ${actualScore} outside expected range ${range}`);
      }

      // Check pass/fail alignment
      const actualPasses = actualScore >= QUALITY_THRESHOLD;
      const passFailMatches = actualPasses === expected.shouldPass;
      if (!passFailMatches) {
        failureReasons.push(
          `Expected ${expected.shouldPass ? 'pass' : 'fail'} at threshold ${QUALITY_THRESHOLD}, ` +
          `got ${actualPasses ? 'pass' : 'fail'} (score=${actualScore})`,
        );
      }

      const passed = scoreInRange && passFailMatches;

      results.push({
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        actualScore,
        scoreInRange,
        passFailMatches,
        jsonParseSuccess: true,
        passed,
        rawResponse: parsed,
        durationMs,
        failureReasons,
      });

      const icon = passed ? 'PASS' : 'FAIL';
      console.log(
        `  ${icon}: ${fixture.id} — ${fixture.name} (score=${actualScore}, expected ${expected.shouldPass ? 'pass' : 'fail'}, ${durationMs}ms)`,
      );
    } catch (error) {
      const durationMs = Date.now() - startMs;
      results.push({
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        actualScore: null,
        scoreInRange: false,
        passFailMatches: false,
        jsonParseSuccess: false,
        passed: false,
        rawResponse: null,
        durationMs,
        failureReasons: [`LLM call failed: ${error instanceof Error ? error.message : String(error)}`],
      });
      console.log(`  FAIL: ${fixture.id} — ${fixture.name} (LLM error, ${durationMs}ms)`);
    }
  }

  // Meta-metric: JSON parse success rate
  const parseRate = fixtures.length > 0 ? (jsonParseSuccessCount / fixtures.length) * 100 : 100;
  console.log(`\n  JSON parse success rate: ${parseRate.toFixed(0)}% (${jsonParseSuccessCount}/${fixtures.length})`);

  // Build EvaluationReport
  const cases: EvaluationCaseResult[] = results.map((r) => ({
    caseId: r.fixtureId,
    name: r.fixtureName,
    result: r.passed ? ('pass' as const) : ('fail' as const),
    reason: r.passed ? undefined : r.failureReasons.join('; '),
    failures: r.passed
      ? undefined
      : r.failureReasons.map((reason) => ({
          tag: 'prompt' as const,
          reason,
          isCritical: false,
        })),
  }));

  const passedCases = cases.filter((c) => c.result === 'pass').length;
  const failedCases = cases.filter((c) => c.result === 'fail').length;
  const avgDuration = results.reduce((s, r) => s + r.durationMs, 0) / (results.length || 1);

  return {
    suite: 'quality-scoring',
    agent: 'reconciliation',
    timestamp: new Date().toISOString(),
    totalCases: cases.length,
    passedCases,
    failedCases,
    skippedCases: 0,
    cases,
    aggregateMetrics: {
      avgDurationMs: Math.round(avgDuration),
      avgTokens: 0,
    },
  };
}
