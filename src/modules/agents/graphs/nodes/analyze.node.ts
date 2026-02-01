/**
 * Analyze Node
 *
 * Evaluates whether enough information has been gathered.
 * Returns a decision enum for richer routing options.
 *
 * Implements evidence ladder enforcement:
 * - Tracks evidence quality levels (0-4)
 * - Enforces minimum evidence level before allowing completion
 * - Provides feedback when evidence is insufficient
 */

import { NodeConfig } from './types';
import { AgentTaskType } from '../../../../common/llm/providers/types';
import { BaseExplorationStateType, EvidenceLevel } from '../types/base-state';
import {
  AnalyzeResultSchema,
  AnalyzeDecisionType,
  parseLLMOutput,
  DEFAULT_ANALYZE_RESULT,
} from '../types/schemas';

/**
 * Options for customizing analyze node behavior
 */
export interface AnalyzeNodeOptions {
  /** Custom completion criteria prompt */
  customPrompt?: string;
  /** Minimum findings required before LLM evaluation */
  minFindings?: number;
  /** Minimum evidence level required for completion (default: 2) */
  minEvidenceLevel?: EvidenceLevel;
  /** Whether to enforce evidence ladder strictly (default: true) */
  enforceEvidenceLadder?: boolean;
}

/**
 * Extended state with analysis decision
 */
export interface AnalyzableState extends BaseExplorationStateType {
  analysisDecision?: AnalyzeDecisionType | null;
  clarificationNeeded?: string | null;
}

/**
 * Get human-readable description for evidence level
 */
function getEvidenceLevelDescription(level: EvidenceLevel): string {
  switch (level) {
    case 0:
      return 'None - No evidence gathered';
    case 1:
      return 'Directory listings only';
    case 2:
      return 'Raw file reads (text content)';
    case 3:
      return 'Parsed structured data (JSON/YAML)';
    case 4:
      return 'Computed/aggregated facts';
  }
}

/**
 * Check if evidence level meets minimum requirement
 */
function checkEvidenceLadder(
  currentLevel: EvidenceLevel,
  minLevel: EvidenceLevel,
  logger?: NodeConfig['logger'],
): { sufficient: boolean; feedback: string } {
  if (currentLevel >= minLevel) {
    return { sufficient: true, feedback: '' };
  }

  const currentDesc = getEvidenceLevelDescription(currentLevel);
  const minDesc = getEvidenceLevelDescription(minLevel);

  const feedback =
    'Evidence level insufficient: currently at level ' +
    currentLevel +
    ' (' +
    currentDesc +
    '), need level ' +
    minLevel +
    ' (' +
    minDesc +
    ')';

  logger?.debug(feedback);

  return { sufficient: false, feedback };
}

/**
 * Common question patterns for fast-path detection
 */
const COVERAGE_PATTERNS = [/coverage/i, /test.*percent/i, /code.*coverage/i, /how much.*tested/i];

/**
 * Check if a question matches coverage patterns
 */
function isCoverageQuestion(input: string): boolean {
  return COVERAGE_PATTERNS.some((p) => p.test(input));
}

/**
 * Check if findings contain complete coverage metrics
 */
function hasCompleteCoverageMetrics(
  findings: BaseExplorationStateType['findings'],
): boolean {
  return findings.some(
    (f) =>
      f.computedFacts?.lines !== undefined ||
      f.computedFacts?.statements !== undefined ||
      (f.parseMetadata?.parseSuccess && f.content.includes('"pct"')),
  );
}

/**
 * Check if computed facts contain answer data for the question
 */
function hasAnswerInComputedFacts(
  input: string,
  findings: BaseExplorationStateType['findings'],
): boolean {
  // For coverage questions, check for coverage metrics
  if (isCoverageQuestion(input)) {
    return hasCompleteCoverageMetrics(findings);
  }

  // For other questions, just having computed facts is a good sign
  return findings.some(
    (f) => f.computedFacts && Object.keys(f.computedFacts).length > 0,
  );
}

/**
 * Analyze node that evaluates whether enough information has been gathered.
 * Returns a decision enum instead of just a boolean.
 *
 * Enforces evidence ladder: requires minimum evidence quality before completion.
 *
 * @param options - Optional customization options
 * @returns Node factory function
 */
export function createAnalyzeNode<TState extends AnalyzableState>(
  options: AnalyzeNodeOptions = {},
) {
  const minEvidenceLevel = options.minEvidenceLevel ?? (2 as EvidenceLevel);
  const enforceEvidenceLadder = options.enforceEvidenceLadder !== false;

  return (config: NodeConfig) =>
    async (state: TState): Promise<Partial<TState>> => {
      // Quick heuristic: max iterations reached (always allow completion)
      if (state.iteration >= state.maxIterations) {
        return {
          isComplete: true,
          analysisDecision: 'max_iterations_reached' as AnalyzeDecisionType,
        } as Partial<TState>;
      }

      // Quick heuristic: not enough findings yet
      if (options.minFindings && state.findings.length < options.minFindings) {
        return {
          isComplete: false,
          analysisDecision: 'need_more_search' as AnalyzeDecisionType,
        } as Partial<TState>;
      }

      // Evidence ladder check: require minimum evidence quality
      if (enforceEvidenceLadder) {
        const evidenceCheck = checkEvidenceLadder(
          state.evidenceLevel,
          minEvidenceLevel,
          config.logger,
        );

        if (!evidenceCheck.sufficient) {
          // Add limitation about evidence level
          const newLimitations = [...(state.limitations || [])];
          if (!newLimitations.includes(evidenceCheck.feedback)) {
            newLimitations.push(evidenceCheck.feedback);
          }

          return {
            isComplete: false,
            analysisDecision: 'need_more_search' as AnalyzeDecisionType,
            limitations: newLimitations,
          } as Partial<TState>;
        }
      }

      // Early termination: if we have computed facts with answer data, skip LLM call
      if (state.evidenceLevel >= 4 && hasAnswerInComputedFacts(state.input, state.findings)) {
        config.logger?.log('Early termination: computed facts contain answer data');
        return {
          isComplete: true,
          analysisDecision: 'ready_to_answer' as AnalyzeDecisionType,
        } as Partial<TState>;
      }

      // Early termination: coverage questions with complete metrics
      if (isCoverageQuestion(state.input) && hasCompleteCoverageMetrics(state.findings)) {
        config.logger?.log('Early termination: coverage question with complete metrics');
        return {
          isComplete: true,
          analysisDecision: 'ready_to_answer' as AnalyzeDecisionType,
        } as Partial<TState>;
      }

      const prompt = options.customPrompt || getDefaultAnalyzePrompt(state, minEvidenceLevel);

      const response = await config.llmService.invoke({
        messages: [{ role: 'user', content: prompt }],
        taskType: AgentTaskType.CLASSIFICATION, // Use cheap model
        agentName: 'analyze-node',
        purpose: 'evaluate-completeness',
      });

      // Use Zod schema validation instead of raw JSON.parse
      const {
        data: analysis,
        success,
        error,
      } = parseLLMOutput(response.content, AnalyzeResultSchema, DEFAULT_ANALYZE_RESULT);

      if (!success) {
        config.logger?.warn('Analyze parsing failed: ' + error);
      }

      // Map decision enum to state
      const isComplete =
        analysis.decision === 'ready_to_answer' || analysis.decision === 'max_iterations_reached';

      return {
        isComplete,
        analysisDecision: analysis.decision,
        clarificationNeeded: analysis.clarificationNeeded || null,
      } as Partial<TState>;
    };
}

/**
 * Count findings by parse quality
 */
function countFindingsByQuality(findings: BaseExplorationStateType['findings']): {
  computed: number;
  parsed: number;
  raw: number;
} {
  let computed = 0;
  let parsed = 0;
  let raw = 0;

  for (const finding of findings) {
    if (finding.computedFacts && Object.keys(finding.computedFacts).length > 0) {
      computed++;
    } else if (finding.parseMetadata?.parseSuccess) {
      parsed++;
    } else {
      raw++;
    }
  }

  return { computed, parsed, raw };
}

/**
 * Default analyze prompt template with evidence ladder awareness
 */
function getDefaultAnalyzePrompt<TState extends BaseExplorationStateType>(
  state: TState,
  minEvidenceLevel: EvidenceLevel,
): string {
  const findingsPreview = state.findings
    .map((f) => {
      const qualityMarker = getQualityMarker(f);
      return '### ' + f.source + qualityMarker + '\n' + f.content.slice(0, 500);
    })
    .join('\n\n');

  const evidenceLevelDesc = getEvidenceLevelDescription(state.evidenceLevel);
  const minLevelDesc = getEvidenceLevelDescription(minEvidenceLevel);
  const qualityCounts = countFindingsByQuality(state.findings);

  const qualitySummary =
    'Finding quality: ' +
    qualityCounts.computed +
    ' computed, ' +
    qualityCounts.parsed +
    ' parsed, ' +
    qualityCounts.raw +
    ' raw';

  return (
    'Evaluate whether you have enough information to complete this task.\n\n' +
    'Task: ' +
    state.input +
    '\n\n' +
    'EVIDENCE STATUS:\n' +
    '- Current evidence level: ' +
    state.evidenceLevel +
    ' (' +
    evidenceLevelDesc +
    ')\n' +
    '- Minimum required: ' +
    minEvidenceLevel +
    ' (' +
    minLevelDesc +
    ')\n' +
    '- ' +
    qualitySummary +
    '\n\n' +
    'Findings so far (' +
    state.findings.length +
    ' items):\n' +
    (findingsPreview || 'No findings yet.') +
    '\n\n' +
    'Iteration: ' +
    state.iteration +
    ' of ' +
    state.maxIterations +
    '\n\n' +
    'EVIDENCE LADDER (quality levels):\n' +
    '0 = Nothing gathered\n' +
    '1 = Directory listings only\n' +
    '2 = Raw file reads (text content)\n' +
    '3 = Parsed structured data (JSON/YAML successfully parsed)\n' +
    '4 = Computed/aggregated facts (server-side calculations)\n\n' +
    'Consider:\n' +
    '1. Is evidence level >= ' +
    minEvidenceLevel +
    '? If not, need more high-quality data.\n' +
    '2. Do parsed/computed findings contain the specific data needed?\n' +
    '3. For numeric questions, do you have parsed JSON or computed facts?\n' +
    '4. Is the question ambiguous and needs user clarification?\n\n' +
    'Respond with JSON:\n' +
    '{\n' +
    '  "decision": "need_more_search" | "ready_to_answer" | "request_clarification",\n' +
    '  "reasoning": "Brief explanation including evidence quality assessment",\n' +
    '  "missingInfo": ["What\'s still needed"],\n' +
    '  "clarificationNeeded": "Question for user",\n' +
    '  "confidence": 0.0 to 1.0\n' +
    '}\n\n' +
    'Decision meanings:\n' +
    '- "need_more_search": Need higher quality evidence (use read_json, read_coverage_report)\n' +
    '- "ready_to_answer": Have sufficient parsed/computed data for a complete answer\n' +
    '- "request_clarification": The question is ambiguous, need user input'
  );
}

/**
 * Get quality marker for a finding
 */
function getQualityMarker(finding: BaseExplorationStateType['findings'][0]): string {
  if (finding.computedFacts && Object.keys(finding.computedFacts).length > 0) {
    return ' [COMPUTED]';
  }
  if (finding.parseMetadata?.parseSuccess) {
    return ' [PARSED]';
  }
  if (finding.truncated) {
    return ' [TRUNCATED]';
  }
  return ' [RAW]';
}
