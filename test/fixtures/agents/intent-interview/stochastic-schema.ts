/**
 * Stochastic Interview Scenario Schema
 *
 * Defines the structure for Tier 2 stochastic test scenarios where an LLM
 * (Haiku) plays the interviewee role against a ground truth specification.
 *
 * Unlike golden tests (Tier 1) which use pre-scripted responses, stochastic
 * tests exercise the full conversation loop with natural language variation.
 */

// ============================================================================
// Ground Truth
// ============================================================================

/**
 * A single fact in the interviewee's ground truth knowledge.
 * Maps to atom-shaped expectations for mechanical precision/recall scoring.
 */
export interface GroundTruthFact {
  /** Unique identifier for this fact */
  id: string;
  /** Human-readable description of the requirement/behavior */
  fact: string;
  /** Expected atom category */
  category: 'functional' | 'performance' | 'security' | 'ux' | 'operational';
  /** Whether the stakeholder has decided this (false = "not decided yet") */
  isDecided: boolean;
  /** Keywords for matching against extracted atom descriptions */
  keywords: string[];
}

// ============================================================================
// Persona
// ============================================================================

/**
 * Persona configuration for the LLM interviewee.
 */
export interface IntervieweePersona {
  /** Persona communication style */
  style: 'terse' | 'normal' | 'verbose' | 'technical' | 'business';
  /** Free-form instructions injected into the interviewee prompt */
  styleInstructions: string;
}

/** Pre-built personas for common stakeholder types */
export const PERSONAS: Record<string, IntervieweePersona> = {
  terse: {
    style: 'terse',
    styleInstructions:
      'Answer in 1-2 short sentences. Be direct and minimal. No elaboration unless asked.',
  },
  verbose: {
    style: 'verbose',
    styleInstructions:
      'Provide detailed answers with context and examples. Explain your reasoning. Use 3-5 sentences.',
  },
  technical: {
    style: 'technical',
    styleInstructions:
      'Use precise technical language. Reference specific technologies, protocols, or patterns where relevant. Be exact about constraints.',
  },
  business: {
    style: 'business',
    styleInstructions:
      'Focus on user impact and business value. Avoid technical jargon. Frame answers in terms of outcomes and user experience.',
  },
  normal: {
    style: 'normal',
    styleInstructions: 'Answer naturally in 2-3 sentences. Balance detail with brevity.',
  },
};

// ============================================================================
// Scenario
// ============================================================================

/**
 * A stochastic scenario for evaluating the interview agent with an LLM interviewee.
 */
export interface StochasticScenario {
  /** Unique scenario identifier (e.g., "stoch-001") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Scenario version for compatibility tracking */
  scenarioVersion: string;
  /** Tags for filtering */
  tags: string[];

  /** Context for the scenario */
  context: {
    /** Domain description */
    domain: string;
    /** Constraints */
    constraints?: string[];
    /** Role label for the interviewee (e.g., "product manager") */
    persona?: string;
  };

  /** The initial user message — what the stakeholder says first */
  initialIntent: string;

  /** Ground truth facts the interviewee knows */
  groundTruth: GroundTruthFact[];

  /** Persona configuration for the interviewee LLM */
  persona: IntervieweePersona;

  /** Number of independent runs for statistical confidence */
  numRuns: number;

  /** Max interview rounds (default: 5) */
  maxRounds?: number;

  /** Evaluation thresholds */
  evaluation: {
    /** Minimum mean precision across runs (0-1) */
    minimumPrecision: number;
    /** Minimum mean recall across runs (0-1) */
    minimumRecall: number;
    /** Minimum mean rubric score (default: 8/12) */
    minimumRubricScore?: number;
    /** Maximum redundant questions per run */
    maxRedundantQuestions?: number;
  };
}

// ============================================================================
// Loader
// ============================================================================

/**
 * Load and validate a stochastic scenario from parsed JSON.
 */
export function loadStochasticScenario(data: Record<string, unknown>): StochasticScenario {
  const scenario = data as unknown as StochasticScenario;

  if (!scenario.id || !scenario.name || !scenario.scenarioVersion) {
    throw new Error(
      'Invalid stochastic scenario: missing required fields (id, name, scenarioVersion)',
    );
  }
  if (!scenario.initialIntent) {
    throw new Error(`Scenario ${scenario.id}: must have an initialIntent`);
  }
  if (!scenario.groundTruth || scenario.groundTruth.length === 0) {
    throw new Error(`Scenario ${scenario.id}: must have at least one ground truth fact`);
  }
  if (!scenario.persona) {
    throw new Error(`Scenario ${scenario.id}: must have a persona`);
  }
  if (!scenario.evaluation) {
    throw new Error(`Scenario ${scenario.id}: must have evaluation thresholds`);
  }

  return scenario;
}
