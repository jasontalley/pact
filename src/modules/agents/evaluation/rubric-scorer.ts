/**
 * Rubric Scorer
 *
 * Automated rubric scoring for agent Run Artifacts. Scores dimensions
 * that can be evaluated structurally (schema, evidence, minimality).
 * Dimensions requiring judgment (clarity, testability) are scored
 * in Layer 3 (human calibration).
 *
 * @see docs/architecture/agent-evaluation-rubrics.md
 * @see docs/implementation-checklist-phase13.md (13.6.3)
 */

import {
  AgentType,
  RunArtifact,
  ReconciliationRunOutput,
  InterviewRunOutput,
  TaggedFailure,
} from './run-artifact.types';

// ============================================================================
// Score Types
// ============================================================================

/** Score for a single dimension: 0 (fail), 1 (weak), 2 (pass) */
export type DimensionScore = 0 | 1 | 2;

/**
 * Detailed scoring result for one dimension.
 */
export interface DimensionResult {
  /** Dimension name */
  dimension: string;
  /** Score (0-2) */
  score: DimensionScore;
  /** Reason for the score */
  reason: string;
  /** Whether this dimension was auto-scored or needs human review */
  autoScored: boolean;
}

/**
 * Full rubric result for a run.
 */
export interface RubricResult {
  /** Agent type */
  agent: AgentType;
  /** Run ID */
  runId: string;
  /** Per-dimension scores */
  dimensions: DimensionResult[];
  /** Total score (sum of dimension scores) */
  totalScore: number;
  /** Maximum possible score */
  maxScore: number;
  /** Critical failures that auto-fail the run */
  criticalFailures: TaggedFailure[];
  /** Overall pass/fail (fails if any critical failure or score below minimum) */
  passed: boolean;
  /** Minimum score required to pass */
  minimumScore: number;
}

// ============================================================================
// Reconciliation Rubric Scorer
// ============================================================================

/**
 * Context for reconciliation scoring (fixture data for validation).
 */
export interface ReconciliationScoringContext {
  /** All file paths that exist in the fixture/repo */
  validFilePaths: string[];
  /** All test names that exist in the fixture/repo */
  validTestNames: string[];
  /** Annotations (test -> atom) that exist in the fixture */
  existingAnnotations: Array<{ testFilePath: string; testName: string; atomId: string }>;
}

/**
 * Score a reconciliation Run Artifact against the rubric.
 */
export function scoreReconciliationRubric(
  artifact: RunArtifact<'reconciliation'>,
  context: ReconciliationScoringContext,
  minimumScore = 8,
): RubricResult {
  const output = artifact.output as ReconciliationRunOutput;
  const dimensions: DimensionResult[] = [];
  const criticalFailures: TaggedFailure[] = [];

  // --- Dimension 1: Classification Correctness ---
  dimensions.push(scoreClassificationCorrectness(output, context));

  // --- Dimension 2: Evidence Grounding ---
  const evidenceResult = scoreEvidenceGrounding(output, context);
  dimensions.push(evidenceResult.dimension);
  criticalFailures.push(...evidenceResult.criticalFailures);

  // --- Dimension 3: Actionability ---
  dimensions.push(scoreActionability(output));

  // --- Dimension 4: Minimality ---
  dimensions.push(scoreMinimality(output));

  // --- Dimension 5: Stability (requires baseline — placeholder for auto-score) ---
  dimensions.push({
    dimension: 'stability',
    score: 2,
    reason: 'Stability requires baseline comparison (Layer 2); defaulting to pass for Layer 1',
    autoScored: false,
  });

  // --- Dimension 6: Safety ---
  dimensions.push(scoreSafety(output));

  const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);

  return {
    agent: 'reconciliation',
    runId: artifact.runId,
    dimensions,
    totalScore,
    maxScore: 12,
    criticalFailures,
    passed: criticalFailures.length === 0 && totalScore >= minimumScore,
    minimumScore,
  };
}

function scoreClassificationCorrectness(
  output: ReconciliationRunOutput,
  context: ReconciliationScoringContext,
): DimensionResult {
  // Check: no annotated test should appear in inferred atoms' source tests
  const annotatedTestKeys = new Set(
    context.existingAnnotations.map((a) => `${a.testFilePath}:${a.testName}`),
  );

  const invR001Violations = output.inferredAtoms.filter((atom) => {
    const key = `${atom.sourceTest.filePath}:${atom.sourceTest.testName}`;
    return annotatedTestKeys.has(key);
  });

  if (invR001Violations.length > 0) {
    return {
      dimension: 'classification_correctness',
      score: 0,
      reason: `INV-R001 violation: ${invR001Violations.length} annotated test(s) flowed to inference`,
      autoScored: true,
    };
  }

  if (output.orphanTestCount === 0 && output.inferredAtoms.length === 0) {
    return {
      dimension: 'classification_correctness',
      score: 2,
      reason: 'No orphan tests and no inferred atoms — correct for perfect state',
      autoScored: true,
    };
  }

  return {
    dimension: 'classification_correctness',
    score: 2,
    reason: 'Classification correct: no INV-R001 violations detected',
    autoScored: true,
  };
}

function scoreEvidenceGrounding(
  output: ReconciliationRunOutput,
  context: ReconciliationScoringContext,
): { dimension: DimensionResult; criticalFailures: TaggedFailure[] } {
  const criticalFailures: TaggedFailure[] = [];
  const validPaths = new Set(context.validFilePaths);

  let invalidReferences = 0;
  for (const atom of output.inferredAtoms) {
    if (!validPaths.has(atom.sourceTest.filePath)) {
      invalidReferences++;
      criticalFailures.push({
        tag: 'model',
        reason: `Hallucinated file path: ${atom.sourceTest.filePath}`,
        contractViolation: 'C-REC-02',
        isCritical: true,
      });
    }
  }

  const score: DimensionScore =
    invalidReferences > 0 ? 0 : output.inferredAtoms.length === 0 ? 2 : 2;

  return {
    dimension: {
      dimension: 'evidence_grounding',
      score,
      reason:
        invalidReferences > 0
          ? `${invalidReferences} hallucinated file reference(s) — critical failure`
          : 'All evidence references valid file paths',
      autoScored: true,
    },
    criticalFailures,
  };
}

function scoreActionability(output: ReconciliationRunOutput): DimensionResult {
  if (output.inferredAtoms.length === 0) {
    return {
      dimension: 'actionability',
      score: 2,
      reason: 'No recommendations needed (clean state)',
      autoScored: true,
    };
  }

  const atomsWithoutOutcomes = output.inferredAtoms.filter(
    (a) => !a.observableOutcomes || a.observableOutcomes.length === 0,
  );

  if (atomsWithoutOutcomes.length > 0) {
    return {
      dimension: 'actionability',
      score: 0,
      reason: `${atomsWithoutOutcomes.length} atom(s) without observable outcomes`,
      autoScored: true,
    };
  }

  const allHaveSourceTest = output.inferredAtoms.every(
    (a) => a.sourceTest?.filePath && a.sourceTest?.testName,
  );

  if (!allHaveSourceTest) {
    return {
      dimension: 'actionability',
      score: 1,
      reason: 'Some atoms missing source test details',
      autoScored: true,
    };
  }

  return {
    dimension: 'actionability',
    score: 2,
    reason: 'All atoms have observable outcomes and source test references',
    autoScored: true,
  };
}

function scoreMinimality(output: ReconciliationRunOutput): DimensionResult {
  // Check for single-atom molecules
  const singleAtomMolecules = output.inferredMolecules.filter((m) => m.atomTempIds.length < 2);

  if (singleAtomMolecules.length > 0) {
    return {
      dimension: 'minimality',
      score: 0,
      reason: `${singleAtomMolecules.length} single-atom molecule(s) (redundant)`,
      autoScored: true,
    };
  }

  // Check for duplicate atom descriptions
  const descriptions = output.inferredAtoms.map((a) => a.description.toLowerCase().trim());
  const uniqueDescriptions = new Set(descriptions);
  if (uniqueDescriptions.size < descriptions.length) {
    return {
      dimension: 'minimality',
      score: 1,
      reason: `${descriptions.length - uniqueDescriptions.size} duplicate atom description(s)`,
      autoScored: true,
    };
  }

  return {
    dimension: 'minimality',
    score: 2,
    reason: 'No redundant molecules or duplicate atoms',
    autoScored: true,
  };
}

function scoreSafety(output: ReconciliationRunOutput): DimensionResult {
  // Check for destructive-sounding recommendations
  const destructivePatterns = /\b(delete|remove|drop|destroy|purge)\b/i;
  const destructiveAtoms = output.inferredAtoms.filter((a) =>
    destructivePatterns.test(a.description),
  );

  if (destructiveAtoms.length > 0) {
    return {
      dimension: 'safety',
      score: 1,
      reason: `${destructiveAtoms.length} recommendation(s) with destructive language — needs caution flag`,
      autoScored: true,
    };
  }

  return {
    dimension: 'safety',
    score: 2,
    reason: 'All recommendations are constructive',
    autoScored: true,
  };
}

// ============================================================================
// Interview Rubric Scorer
// ============================================================================

/**
 * Score an interview Run Artifact against the rubric.
 */
export function scoreInterviewRubric(
  artifact: RunArtifact<'interview'>,
  minimumScore = 8,
): RubricResult {
  const output = artifact.output as InterviewRunOutput;
  const dimensions: DimensionResult[] = [];
  const criticalFailures: TaggedFailure[] = [];

  // --- Dimension 1: Atom Clarity (partially auto-scored) ---
  dimensions.push(scoreAtomClarity(output));

  // --- Dimension 2: Validator Testability ---
  const testabilityResult = scoreValidatorTestability(output);
  dimensions.push(testabilityResult.dimension);
  criticalFailures.push(...testabilityResult.criticalFailures);

  // --- Dimension 3: Edge-Case Coverage (auto-scored from question generation) ---
  dimensions.push(scoreEdgeCaseCoverage(output));

  // --- Dimension 4: Ambiguity Discipline ---
  dimensions.push(scoreAmbiguityDiscipline(output));

  // --- Dimension 5: Invariant Alignment (auto-scored from atom content) ---
  dimensions.push(scoreInvariantAlignment(output));

  // --- Dimension 6: Compression ---
  dimensions.push(scoreCompression(output));

  const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);

  return {
    agent: 'interview',
    runId: artifact.runId,
    dimensions,
    totalScore,
    maxScore: 12,
    criticalFailures,
    passed: criticalFailures.length === 0 && totalScore >= minimumScore,
    minimumScore,
  };
}

function scoreAtomClarity(output: InterviewRunOutput): DimensionResult {
  if (output.atomCandidates.length === 0) {
    return {
      dimension: 'atom_clarity',
      score: 0,
      reason: 'No atoms extracted',
      autoScored: true,
    };
  }

  // Check: every atom has non-empty description and valid category
  const validCategories = new Set(['functional', 'performance', 'security', 'ux', 'operational']);
  const invalidAtoms = output.atomCandidates.filter(
    (a) => !a.description || a.description.length < 10 || !validCategories.has(a.category),
  );

  if (invalidAtoms.length > 0) {
    return {
      dimension: 'atom_clarity',
      score: 0,
      reason: `${invalidAtoms.length} atom(s) with invalid description or category`,
      autoScored: true,
    };
  }

  return {
    dimension: 'atom_clarity',
    score: 2,
    reason: 'All atoms have valid descriptions and categories',
    autoScored: true,
  };
}

function scoreValidatorTestability(output: InterviewRunOutput): {
  dimension: DimensionResult;
  criticalFailures: TaggedFailure[];
} {
  const criticalFailures: TaggedFailure[] = [];

  // Critical: atoms without observable outcomes
  const vacuousAtoms = output.atomCandidates.filter(
    (a) => !a.observableOutcomes || a.observableOutcomes.length === 0,
  );

  if (vacuousAtoms.length > 0) {
    criticalFailures.push({
      tag: 'schema',
      reason: `${vacuousAtoms.length} vacuous atom(s) with no observable outcomes`,
      contractViolation: 'C-INT-01',
      isCritical: true,
    });
  }

  const score: DimensionScore = vacuousAtoms.length > 0 ? 0 : 2;

  return {
    dimension: {
      dimension: 'validator_testability',
      score,
      reason:
        vacuousAtoms.length > 0
          ? `${vacuousAtoms.length} atom(s) without observable outcomes — critical`
          : 'All atoms have observable outcomes',
      autoScored: true,
    },
    criticalFailures,
  };
}

function scoreAmbiguityDiscipline(output: InterviewRunOutput): DimensionResult {
  if (output.questionsAsked === 0) {
    return {
      dimension: 'ambiguity_discipline',
      score: 0,
      reason: 'No clarifying questions asked — agent may be silently assuming',
      autoScored: true,
    };
  }

  if (output.questionsAsked >= 3) {
    return {
      dimension: 'ambiguity_discipline',
      score: 2,
      reason: `${output.questionsAsked} clarifying questions asked`,
      autoScored: true,
    };
  }

  return {
    dimension: 'ambiguity_discipline',
    score: 1,
    reason: `Only ${output.questionsAsked} question(s) asked — may miss ambiguities`,
    autoScored: true,
  };
}

function scoreCompression(output: InterviewRunOutput): DimensionResult {
  const count = output.atomCandidates.length;

  if (count === 0) {
    return {
      dimension: 'compression',
      score: 0,
      reason: 'No atoms extracted (atom starvation)',
      autoScored: true,
    };
  }

  // Scale thresholds by conversation complexity: more rounds = more information
  // gathered = more atoms legitimately expected.
  const rounds = output.roundsCompleted || 1;
  const passThreshold = 5 + rounds * 3;
  const warnThreshold = passThreshold + 4;

  if (count > warnThreshold) {
    return {
      dimension: 'compression',
      score: 0,
      reason: `${count} atoms for ${rounds} round(s) (limit: ${warnThreshold}) — likely atom spam`,
      autoScored: true,
    };
  }

  if (count > passThreshold) {
    return {
      dimension: 'compression',
      score: 1,
      reason: `${count} atoms for ${rounds} round(s) (target: ≤${passThreshold}) — may be over-decomposed`,
      autoScored: true,
    };
  }

  return {
    dimension: 'compression',
    score: 2,
    reason: `${count} atoms for ${rounds} round(s) — appropriate compression`,
    autoScored: true,
  };
}

function scoreEdgeCaseCoverage(output: InterviewRunOutput): DimensionResult {
  const questionCount = output.questionsAsked ?? 0;

  if (questionCount === 0) {
    return {
      dimension: 'edge_case_coverage',
      score: 0,
      reason: 'No questions generated — no edge-case exploration',
      autoScored: true,
    };
  }

  // Check if at least some questions probe edge cases
  const edgeCaseKeywords =
    /what happens|how should|what if|edge case|error|fail|conflict|invalid|timeout|exceed/i;
  const allQuestions = output.allQuestions || [];
  const edgeCaseQuestions = allQuestions.filter((q) => edgeCaseKeywords.test(q.question));

  if (questionCount >= 3 && edgeCaseQuestions.length >= 1) {
    return {
      dimension: 'edge_case_coverage',
      score: 2,
      reason: `${questionCount} questions generated, ${edgeCaseQuestions.length} edge-case question(s)`,
      autoScored: true,
    };
  }

  return {
    dimension: 'edge_case_coverage',
    score: 1,
    reason: `${questionCount} questions generated, ${edgeCaseQuestions.length} edge-case question(s) — limited exploration`,
    autoScored: true,
  };
}

function scoreInvariantAlignment(output: InterviewRunOutput): DimensionResult {
  // Without invariant context from the scenario, we can only check structural quality
  // Check if atoms reference constraint-related concepts
  const constraintKeywords = /must|never|always|required|mandatory|cannot|forbidden|guarantee/i;
  const constraintAtoms = output.atomCandidates.filter((a) =>
    constraintKeywords.test(a.description),
  );

  if (output.atomCandidates.length === 0) {
    return {
      dimension: 'invariant_alignment',
      score: 0,
      reason: 'No atoms to evaluate for invariant alignment',
      autoScored: true,
    };
  }

  if (constraintAtoms.length >= 1) {
    return {
      dimension: 'invariant_alignment',
      score: 2,
      reason: `${constraintAtoms.length} atom(s) reference constraint/invariant language`,
      autoScored: true,
    };
  }

  return {
    dimension: 'invariant_alignment',
    score: 1,
    reason: 'No atoms explicitly reference constraints — may miss invariants',
    autoScored: true,
  };
}
