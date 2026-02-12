/**
 * Micro-Inference Runner
 *
 * Tests individual LLM inference calls against known evidence
 * with ground-truth expectations. One LLM call per fixture, ~$0.005 each.
 *
 * Uses the same system prompt as infer-atoms.node.ts to ensure
 * parity with the production inference pipeline.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LLMService } from '../../../common/llm/llm.service';
import { parseJsonWithRecovery } from '../../../common/llm/json-recovery';
import {
  MicroInferenceFixture,
  MicroInferenceResult,
} from '../../../../test/fixtures/agents/micro-inference/micro-inference-schema';
import {
  EvaluationReport,
  EvaluationCaseResult,
} from './run-artifact.types';

/**
 * System prompt extracted from infer-atoms.node.ts — must stay in sync.
 * We import the concept, not the literal constant, to avoid coupling the
 * test runner to the full reconciliation graph dependency tree.
 */
const INFERENCE_SYSTEM_PROMPT = `You are an Intent Atom inference engine for a software product analysis system.

## What is an Intent Atom?
An Intent Atom is an irreducible behavioral specification — it describes WHAT a system does, not HOW it's implemented. Atoms are observable, falsifiable, and implementation-agnostic. They are the atomic unit of committed product intent.

## Critical Requirements

1. **Observable Outcomes Only**: Describe WHAT happens from a user or system perspective, not HOW it's implemented internally.
   - GOOD: "User receives email notification within 5 minutes of order placement"
   - BAD: "EmailService.send() is called with correct parameters"

2. **Testable and Falsifiable**: The atom must describe a behavior that can be verified through testing or observation.
   - GOOD: "Cart total updates when items are added or removed"
   - BAD: "System handles authentication properly"

3. **Implementation Agnostic**: No mentions of specific classes, methods, functions, libraries, or internal technologies.
   - GOOD: "Users can search products by name, category, or price range"
   - BAD: "ProductService.search() uses Elasticsearch with fuzzy matching"

4. **Single Behavior**: One atom = one verifiable behavior.
   - GOOD: "User can reset password using email link"
   - BAD: "User authentication including login, logout, and password reset"

## Evidence Type Guidelines
- **Test**: Infer the behavioral intent that the test validates.
- **Source export**: Infer what capability this exported function/class enables.
- **UI component**: Infer what the user can DO with this component.
- **API endpoint**: Infer what system capability this endpoint exposes.
- **Documentation**: Extract the behavioral intent described.
- **Code comment**: Extract behavioral intent from JSDoc, annotations, business rules.
- **Coverage gap**: Infer what untested behavior this code likely implements. Lower confidence.

## Confidence Scale (0-100)
- 90-100: Clear, unambiguous behavioral intent with strong evidence
- 70-89: Reasonable inference with minor ambiguity
- 50-69: Moderate confidence, some interpretation required
- 30-49: Low confidence, speculative inference
- Below 30: Very speculative, mostly guesswork

## Response Format
Respond with JSON only. No markdown fences:
{
  "description": "Clear, behavior-focused description (1-2 sentences)",
  "category": "functional|security|performance|reliability|usability",
  "observableOutcomes": ["Outcome 1", "Outcome 2"],
  "confidence": 0-100,
  "reasoning": "Brief explanation"
}`;

/**
 * Build a user prompt for inference from a fixture's evidence.
 */
function buildUserPrompt(fixture: MicroInferenceFixture): string {
  const evidence = fixture.evidence;
  const typeLabel = fixture.evidenceType.replace(/_/g, ' ');

  let prompt = `Analyze this ${typeLabel} and infer the Intent Atom it represents.\n\n`;

  if (evidence.testName) {
    prompt += `## Test Name\n${evidence.testName}\n\n`;
  }

  prompt += `## File\n${evidence.filePath}\n\n`;
  prompt += `## Code\n\`\`\`\n${evidence.sourceCode}\n\`\`\`\n\n`;
  prompt += `Respond with JSON only.`;

  return prompt;
}

/**
 * Score a fixture result against expectations.
 */
function scoreResult(
  fixture: MicroInferenceFixture,
  parsed: Record<string, unknown> | null,
): Omit<MicroInferenceResult, 'fixtureId' | 'fixtureName' | 'rawResponse' | 'durationMs'> {
  const failureReasons: string[] = [];
  const expected = fixture.expectedAtom;

  if (!parsed) {
    return {
      descriptionMatch: false,
      categoryMatch: false,
      confidenceOk: false,
      hasOutcomes: false,
      noImplLeakage: true,
      noForbiddenTerms: true,
      checksPassedCount: 0,
      totalChecks: 4,
      passed: false,
      failureReasons: ['Failed to parse LLM response'],
    };
  }

  const description = String(parsed.description || '').toLowerCase();
  const category = String(parsed.category || '');
  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
  const outcomes = Array.isArray(parsed.observableOutcomes) ? parsed.observableOutcomes : [];

  // Check 1: Description contains at least one expected term
  const descriptionMatch = expected.descriptionContainsAny.some(
    (term) => description.includes(term.toLowerCase()),
  );
  if (!descriptionMatch) {
    failureReasons.push(
      `Description "${description}" does not contain any of: ${expected.descriptionContainsAny.join(', ')}`,
    );
  }

  // Check 2: Category is in expected list
  const categoryMatch = expected.categoryOneOf.includes(category);
  if (!categoryMatch) {
    failureReasons.push(`Category "${category}" not in: ${expected.categoryOneOf.join(', ')}`);
  }

  // Check 3: Confidence meets minimum
  const confidenceOk = confidence >= expected.minConfidence;
  if (!confidenceOk) {
    failureReasons.push(`Confidence ${confidence} < minimum ${expected.minConfidence}`);
  }

  // Check 4: Has observable outcomes
  const hasOutcomes = !expected.hasObservableOutcomes || outcomes.length > 0;
  if (!hasOutcomes) {
    failureReasons.push('No observable outcomes returned');
  }

  // Check 5: Implementation agnostic (optional)
  let noImplLeakage = true;
  const implCheckApplies = expected.implementationAgnostic === true;
  if (implCheckApplies) {
    // Check for common implementation leak patterns: class names, function calls, DB references
    const implPatterns = /\b(class|function|method|service|controller|repository|prisma|typeorm)\b/i;
    if (implPatterns.test(description)) {
      noImplLeakage = false;
      failureReasons.push('Description contains implementation-specific terms');
    }
  }

  // Check 6: No forbidden terms (optional)
  let noForbiddenTerms = true;
  if (expected.notContainsAny && expected.notContainsAny.length > 0) {
    for (const forbidden of expected.notContainsAny) {
      if (description.includes(forbidden.toLowerCase())) {
        noForbiddenTerms = false;
        failureReasons.push(`Description contains forbidden term: "${forbidden}"`);
      }
    }
  }

  // Count checks
  let totalChecks = 4; // description, category, confidence, outcomes
  let checksPassedCount = [descriptionMatch, categoryMatch, confidenceOk, hasOutcomes].filter(Boolean).length;

  if (implCheckApplies) {
    totalChecks++;
    if (noImplLeakage) checksPassedCount++;
  }
  if (expected.notContainsAny && expected.notContainsAny.length > 0) {
    totalChecks++;
    if (noForbiddenTerms) checksPassedCount++;
  }

  // Pass if >= 4 checks passed (or all but one for 5-6 check fixtures)
  const passThreshold = Math.max(4, totalChecks - 1);
  const passed = checksPassedCount >= passThreshold;

  return {
    descriptionMatch,
    categoryMatch,
    confidenceOk,
    hasOutcomes,
    noImplLeakage,
    noForbiddenTerms,
    checksPassedCount,
    totalChecks,
    passed,
    failureReasons,
  };
}

/**
 * Load fixtures from the fixtures directory.
 */
function loadFixtures(
  fixturesDir: string,
  fixtureIds?: string[],
): MicroInferenceFixture[] {
  const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
  const fixtures: MicroInferenceFixture[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(fixturesDir, file), 'utf-8');
    const fixture = JSON.parse(content) as MicroInferenceFixture;
    if (!fixtureIds || fixtureIds.includes(fixture.id)) {
      fixtures.push(fixture);
    }
  }

  return fixtures.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Run the micro-inference evaluation suite.
 *
 * @param llmService - LLM service instance
 * @param options - Runner options
 * @returns EvaluationReport
 */
export async function runMicroInference(
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
    path.resolve(__dirname, '../../../../test/fixtures/agents/micro-inference/fixtures');

  const fixtures = loadFixtures(fixturesDir, options.fixtureIds);
  const results: MicroInferenceResult[] = [];

  console.log(`Running ${fixtures.length} micro-inference fixtures...`);

  // Run fixtures sequentially to avoid rate limits
  for (const fixture of fixtures) {
    const startMs = Date.now();

    try {
      const response = await llmService.invoke({
        messages: [
          { role: 'system', content: INFERENCE_SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(fixture) },
        ],
        agentName: 'micro-inference-eval',
        purpose: `Evaluate fixture ${fixture.id}`,
        temperature: options.temperature ?? 0,
        ...(options.model ? { preferredModel: options.model } : {}),
      });

      const parsed = parseJsonWithRecovery(response.content) as Record<string, unknown> | null;
      const score = scoreResult(fixture, parsed);
      const durationMs = Date.now() - startMs;

      const result: MicroInferenceResult = {
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        rawResponse: parsed,
        durationMs,
        ...score,
      };

      results.push(result);

      const icon = result.passed ? 'PASS' : 'FAIL';
      console.log(
        `  ${icon}: ${fixture.id} — ${fixture.name} (${result.checksPassedCount}/${result.totalChecks} checks, ${durationMs}ms)`,
      );
    } catch (error) {
      const durationMs = Date.now() - startMs;
      results.push({
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        descriptionMatch: false,
        categoryMatch: false,
        confidenceOk: false,
        hasOutcomes: false,
        noImplLeakage: true,
        noForbiddenTerms: true,
        checksPassedCount: 0,
        totalChecks: 4,
        passed: false,
        rawResponse: null,
        durationMs,
        failureReasons: [`LLM call failed: ${error instanceof Error ? error.message : String(error)}`],
      });
      console.log(`  FAIL: ${fixture.id} — ${fixture.name} (LLM error, ${durationMs}ms)`);
    }
  }

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
    suite: 'micro-inference',
    agent: 'reconciliation',
    timestamp: new Date().toISOString(),
    totalCases: cases.length,
    passedCases,
    failedCases,
    skippedCases: 0,
    cases,
    aggregateMetrics: {
      avgDurationMs: Math.round(avgDuration),
      avgTokens: 0, // Not tracked per-fixture
    },
  };
}
