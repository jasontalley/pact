/**
 * Verify Node
 *
 * Validates inferred atoms against quality thresholds.
 * Classifies atoms as passing or failing quality.
 *
 * **Phase 4 Updates**:
 * - Supports interrupt for human review when required
 * - Processes human review input on resume
 * - Uses LangGraph interrupt() for pause/resume flow
 *
 * Uses the `validate_atom_quality` tool via ToolRegistryService.
 *
 * @see docs/implementation-checklist-phase5.md Section 1.10
 * @see docs/implementation-checklist-phase5.md Section 2.3 (refactored to use tools)
 * @see docs/implementation-checklist-phase5.md Section 4.1 (interrupt support)
 */

import { NodeConfig } from '../types';
import {
  ReconciliationGraphStateType,
  ReconciliationDecision,
  InferredAtom,
  HumanReviewInput,
} from '../../types/reconciliation-state';

/**
 * Options for customizing verify node behavior
 */
export interface VerifyNodeOptions {
  /** Quality threshold (0-100) - atoms below this are marked as quality_fail */
  qualityThreshold?: number;
  /** Whether to require human review before persisting */
  requireReview?: boolean;
  /** Custom quality scoring function */
  customScorer?: (atom: InferredAtom) => number;
  /** Use tool-based validation (default: true) */
  useTool?: boolean;
  /** Use LangGraph interrupt for human review (default: true) */
  useInterrupt?: boolean;
  /**
   * Force interrupt when quality failures exceed passes (default: false)
   * When false, only interrupts if requireReview is explicitly true.
   * When true, interrupts if failCount > passCount (legacy behavior).
   */
  forceInterruptOnQualityFail?: boolean;
}

/**
 * Data passed to human during interrupt
 */
export interface InterruptPayload {
  /** Summary of validation results */
  summary: {
    totalAtoms: number;
    passCount: number;
    failCount: number;
    qualityThreshold: number;
  };
  /** Atoms pending review */
  pendingAtoms: Array<{
    tempId: string;
    description: string;
    category: string;
    qualityScore: number;
    passes: boolean;
    issues: string[];
  }>;
  /** Molecules pending review */
  pendingMolecules: Array<{
    tempId: string;
    name: string;
    description: string;
    atomCount: number;
    confidence: number;
  }>;
  /** Reason for interrupt */
  reason: string;
}

/**
 * Tool result type for validate_atom_quality
 * Matches AtomQualityResult from atom-quality.service.ts
 */
interface ValidateAtomToolResult {
  totalScore: number;
  decision: 'approve' | 'revise' | 'reject';
  actionableImprovements: string[];
  overallFeedback: string;
}

/**
 * Quality scoring rules for atoms
 */
interface QualityRule {
  name: string;
  weight: number;
  check: (atom: InferredAtom) => boolean;
}

/**
 * Default quality rules based on atom characteristics.
 *
 * Updated in Phase 6 to be more lenient for auto-inferred atoms:
 * - has_source_test gives bonus points for atoms inferred from tests
 * - has_description is lenient (5 chars minimum)
 * - has_outcomes is optional but rewarded
 * - has_reasoning is optional but rewarded
 * - confidence threshold lowered to 50
 *
 * Total possible: 100 points
 */
const DEFAULT_QUALITY_RULES: QualityRule[] = [
  {
    name: 'has_description',
    weight: 25,
    check: (atom) => !!atom.description && atom.description.length > 5,
  },
  {
    name: 'has_outcomes',
    weight: 15,
    check: (atom) => atom.observableOutcomes?.length > 0,
  },
  {
    name: 'has_category',
    weight: 15,
    check: (atom) => !!atom.category,
  },
  {
    name: 'has_reasoning',
    weight: 10,
    check: (atom) => !!atom.reasoning && atom.reasoning.length > 10,
  },
  {
    name: 'has_confidence',
    weight: 15,
    // Confidence is stored as 0-1 (e.g., 0.7), not 0-100
    check: (atom) => atom.confidence >= 0.5,
  },
  {
    name: 'no_ambiguity',
    weight: 10,
    check: (atom) => !atom.ambiguityReasons || atom.ambiguityReasons.length === 0,
  },
  {
    name: 'has_source_test',
    weight: 10,
    check: (atom) => !!atom.sourceTest?.filePath && !!atom.sourceTest?.testName,
  },
];

/**
 * Calculate quality score for an atom using rules
 */
function calculateQualityScore(atom: InferredAtom, rules: QualityRule[]): number {
  let score = 0;
  for (const rule of rules) {
    if (rule.check(atom)) {
      score += rule.weight;
    }
  }
  return Math.min(100, score);
}

/**
 * Validate atom description for quality
 */
function validateDescription(description: string): string[] {
  const issues: string[] = [];

  // Check for implementation details
  const implementationPatterns = [
    /\bclass\b/i,
    /\bmethod\b/i,
    /\bfunction\b/i,
    /\(\)\s*$/,
    /\bService\b/,
    /\bRepository\b/,
    /\bController\b/,
  ];

  for (const pattern of implementationPatterns) {
    if (pattern.test(description)) {
      issues.push(`Description contains implementation detail: ${pattern}`);
    }
  }

  // Check for vague descriptions
  if (description.length < 20) {
    issues.push('Description too short (< 20 chars)');
  }

  // Check for missing subject
  if (!description.match(/^(user|system|application|service|when|if)/i)) {
    // Not starting with a subject is fine, just note it
  }

  return issues;
}

/**
 * Validate observable outcomes
 */
function validateOutcomes(outcomes: string[]): string[] {
  const issues: string[] = [];

  if (!outcomes || outcomes.length === 0) {
    issues.push('No observable outcomes defined');
    return issues;
  }

  for (const outcome of outcomes) {
    // Check for testable outcomes
    if (outcome.length < 10) {
      issues.push(`Outcome too short: "${outcome}"`);
    }

    // Check for vague outcomes
    const vaguePatterns = [/works/i, /handles/i, /properly/i, /correctly/i];
    for (const pattern of vaguePatterns) {
      if (pattern.test(outcome) && outcome.length < 30) {
        issues.push(`Outcome may be vague: "${outcome}"`);
      }
    }
  }

  return issues;
}

/**
 * Validate atom using direct implementation (fallback when tool unavailable)
 */
function validateAtomDirect(
  atom: InferredAtom,
  qualityThreshold: number,
  customScorer?: (atom: InferredAtom) => number,
): { score: number; issues: string[]; passes: boolean } {
  // Calculate quality score
  const score = customScorer
    ? customScorer(atom)
    : calculateQualityScore(atom, DEFAULT_QUALITY_RULES);

  // Collect validation issues
  const issues: string[] = [];
  issues.push(...validateDescription(atom.description));
  issues.push(...validateOutcomes(atom.observableOutcomes));

  return {
    score,
    issues,
    passes: score >= qualityThreshold,
  };
}

/**
 * Process human review input and update decisions.
 *
 * @param atoms - Inferred atoms
 * @param molecules - Inferred molecules
 * @param reviewInput - Human review decisions
 * @param threshold - Quality threshold
 * @returns Updated decisions array
 */
function processHumanReviewInput(
  atoms: InferredAtom[],
  reviewInput: HumanReviewInput,
  threshold: number,
): ReconciliationDecision[] {
  const decisions: ReconciliationDecision[] = [];

  // Build a map of human decisions for atoms
  const atomDecisionMap = new Map<string, 'approve' | 'reject'>();
  for (const decision of reviewInput.atomDecisions) {
    atomDecisionMap.set(decision.recommendationId, decision.decision);
  }

  // Apply human decisions, fall back to quality-based decisions
  for (const atom of atoms) {
    const humanDecision = atomDecisionMap.get(atom.tempId);

    if (humanDecision === 'approve') {
      decisions.push('approved');
    } else if (humanDecision === 'reject') {
      decisions.push('rejected');
    } else {
      // No human decision - use quality-based decision
      if ((atom.qualityScore || 0) >= threshold) {
        decisions.push('approved');
      } else {
        decisions.push('quality_fail');
      }
    }
  }

  return decisions;
}

/**
 * Creates the verify node for the reconciliation graph.
 *
 * This node:
 * 1. Validates each inferred atom against quality rules
 * 2. Calculates quality score and stores it on the atom
 * 3. Classifies atoms as approved or quality_fail
 * 4. If human review required and useInterrupt=true, calls interrupt()
 * 5. On resume, processes human review input to update decisions
 * 6. Updates state with decisions
 *
 * @param options - Optional customization options
 * @returns Node factory function
 */
export function createVerifyNode(options: VerifyNodeOptions = {}) {
  const qualityThreshold = options.qualityThreshold || 80;
  const requireReview = options.requireReview || false;
  const useTool = options.useTool ?? true;
  const useInterrupt = options.useInterrupt ?? true;
  const forceInterruptOnQualityFail = options.forceInterruptOnQualityFail ?? false;

  return (config: NodeConfig) =>
    async (state: ReconciliationGraphStateType): Promise<Partial<ReconciliationGraphStateType>> => {
      const inferredAtoms = state.inferredAtoms || [];
      const inputRequireReview = state.input?.options?.requireReview ?? requireReview;
      const inputThreshold = state.input?.options?.qualityThreshold ?? qualityThreshold;
      const humanReviewInput = state.humanReviewInput;

      // Check if we're resuming from an interrupt with human input
      if (humanReviewInput && state.wasResumed) {
        config.logger?.log(
          `[VerifyNode] Resuming with human review input (${humanReviewInput.atomDecisions.length} atom decisions)`,
        );

        // Process human decisions
        const decisions = processHumanReviewInput(inferredAtoms, humanReviewInput, inputThreshold);

        const approvedCount = decisions.filter((d) => d === 'approved').length;
        const rejectedCount = decisions.filter((d) => d === 'rejected').length;

        config.logger?.log(
          `[VerifyNode] After human review: ${approvedCount} approved, ${rejectedCount} rejected`,
        );

        return {
          decisions,
          pendingHumanReview: false,
          currentPhase: 'persist',
        };
      }

      config.logger?.log(
        `[VerifyNode] Validating ${inferredAtoms.length} atoms (threshold: ${inputThreshold}, useTool=${useTool})`,
      );

      // Check if tool is available
      const hasValidateTool = useTool && config.toolRegistry.hasTool('validate_atom_quality');

      let passCount = 0;
      let failCount = 0;

      // Validate each atom
      for (const atom of inferredAtoms) {
        let score: number;
        let issues: string[] = [];
        let passes: boolean;

        // Try tool-based validation first
        if (hasValidateTool) {
          try {
            const toolResult = (await config.toolRegistry.executeTool('validate_atom_quality', {
              atom_id: atom.tempId,
              description: atom.description,
              observable_outcomes: JSON.stringify(atom.observableOutcomes || []),
              category: atom.category || '',
            })) as ValidateAtomToolResult;

            score = toolResult.totalScore;
            issues = toolResult.actionableImprovements || [];
            // Use the decision or fallback to threshold check
            passes = toolResult.decision === 'approve' || score >= inputThreshold;
          } catch (toolError) {
            const toolErrorMessage =
              toolError instanceof Error ? toolError.message : String(toolError);
            config.logger?.warn(
              `[VerifyNode] Tool failed for ${atom.tempId}, falling back: ${toolErrorMessage}`,
            );

            // Fallback to direct validation
            const result = validateAtomDirect(atom, inputThreshold, options.customScorer);
            score = result.score;
            issues = result.issues;
            passes = result.passes;
          }
        } else {
          // Fallback: Direct validation
          const result = validateAtomDirect(atom, inputThreshold, options.customScorer);
          score = result.score;
          issues = result.issues;
          passes = result.passes;
        }

        // Store score on atom (mutating for simplicity)
        atom.qualityScore = score;

        // Classify
        if (passes) {
          passCount++;
        } else {
          failCount++;
          config.logger?.log(
            `[VerifyNode] Atom ${atom.tempId} failed quality (${score} < ${inputThreshold}): ${atom.description.substring(0, 50)}...`,
          );
          if (issues.length > 0) {
            config.logger?.log(`[VerifyNode]   Issues: ${issues.join('; ')}`);
          }
        }
      }

      config.logger?.log(`[VerifyNode] Quality results: ${passCount} pass, ${failCount} fail`);

      // Warn if quality failure rate is high (but don't interrupt unless requested)
      const failureRate = inferredAtoms.length > 0 ? failCount / inferredAtoms.length : 0;
      if (failureRate > 0.5) {
        config.logger?.warn(
          `[VerifyNode] High quality failure rate: ${(failureRate * 100).toFixed(1)}% ` +
            `(${failCount}/${inferredAtoms.length}). Consider reviewing the inference prompts or lowering the quality threshold.`,
        );
      }

      // Determine decisions (initial, may be updated by human)
      const decisions: ReconciliationDecision[] = [];

      // All atoms get a decision based on quality
      for (const atom of inferredAtoms) {
        if ((atom.qualityScore || 0) >= inputThreshold) {
          decisions.push('approved');
        } else {
          decisions.push('quality_fail');
        }
      }

      // Determine if human review is needed
      // Phase 6 Fix: Only interrupt when explicitly requested via requireReview option.
      // The forceInterruptOnQualityFail option enables the old behavior where
      // failCount > passCount would trigger an interrupt.
      const inputForceInterruptOnQualityFail =
        state.input?.options?.forceInterruptOnQualityFail ?? forceInterruptOnQualityFail;
      const qualityFailCondition = inputForceInterruptOnQualityFail && failCount > passCount;
      const needsReview = inputRequireReview || qualityFailCondition;

      // If human review needed, return with pendingHumanReview=true and stay in 'verify' phase.
      // The graph routing (afterVerify) will route to END instead of persist,
      // and the service layer will detect the interrupt from the returned state.
      // (LangGraph 1.x: NodeInterrupt no longer throws to the caller,
      // so we return state and let conditional routing handle the pause.)
      if (needsReview && useInterrupt && inferredAtoms.length > 0) {
        config.logger?.log(
          `[VerifyNode] Pausing for human review (requireReview=${inputRequireReview}, ` +
            `forceInterruptOnQualityFail=${inputForceInterruptOnQualityFail}, failCount=${failCount})`,
        );

        return {
          decisions,
          pendingHumanReview: true,
          currentPhase: 'verify',
        };
      }

      if (needsReview) {
        config.logger?.log(`[VerifyNode] Flagging for human review (interrupt disabled)`);
      }

      return {
        decisions,
        pendingHumanReview: needsReview,
        currentPhase: 'persist',
      };
    };
}
