/**
 * Intent Interview Golden Scenario Schema
 *
 * Defines the structure for golden test scenarios used to evaluate
 * the Intent Interview agent.
 *
 * @see docs/implementation-checklist-phase13.md (13.3.1.1)
 * @see docs/architecture/agent-contracts.md (Intent Interview contract)
 */

/**
 * A golden scenario for evaluating the Intent Interview agent.
 */
export interface IntentInterviewScenario {
  /** Unique scenario identifier */
  id: string;
  /** Human-readable scenario name */
  name: string;
  /** Scenario version for compatibility tracking */
  scenarioVersion: string;
  /** Tags for filtering (e.g., 'ambiguous', 'conflicting', 'implementation-push') */
  tags: string[];

  /** Context for the scenario */
  context: {
    /** Domain description (e.g., 'e-commerce checkout', 'authentication') */
    domain: string;
    /** Constraints to provide to the agent */
    constraints?: string[];
    /** Persona of the user (e.g., 'product manager', 'developer') */
    persona?: string;
    /** Project invariants to provide (optional) */
    invariants?: string[];
  };

  /** Simulated user messages (turns in the conversation) */
  userMessages: UserMessage[];

  /** Expected atoms (structural expectations — not exact text matches) */
  expectedAtoms: ExpectedAtom[];

  /** Expected open questions (ambiguities the agent should surface) */
  expectedOpenQuestions?: string[];

  /** Expected non-goals (things the agent must NOT assume) */
  expectedNonGoals?: string[];

  /** Minimum rubric score required to pass (out of 12) */
  minimumRubricScore?: number;

  /** Expected failure tags (for adversarial scenarios) */
  expectedFailures?: string[];
}

/**
 * A simulated user message in the conversation.
 */
export interface UserMessage {
  /** Turn number (1-based) */
  turn: number;
  /** The user's message content */
  content: string;
  /** Which question IDs this message answers (if responding to agent questions) */
  answersQuestionIds?: string[];
  /** Whether this is the "I'm done" signal */
  signalsDone?: boolean;
}

/**
 * Structural expectation for an extracted atom.
 * Evaluated on structure and intent, not exact text match.
 */
export interface ExpectedAtom {
  /** Description pattern — single substring that should appear */
  descriptionContains?: string;
  /** Description patterns — match if ANY substring is found (use for semantic drift tolerance) */
  descriptionContainsAny?: string[];
  /** Expected category (exact match) */
  category?: 'functional' | 'performance' | 'security' | 'ux' | 'operational';
  /** Accept any of these categories (for ambiguous domains) */
  categoryOneOf?: Array<'functional' | 'performance' | 'security' | 'ux' | 'operational'>;
  /** Minimum number of observable outcomes */
  minOutcomes: number;
  /** Minimum confidence score */
  minConfidence?: number;
  /** Whether at least one source evidence entry is required */
  requiresEvidence: boolean;
}

/**
 * Load a scenario from a JSON file.
 */
export function loadScenario(data: Record<string, unknown>): IntentInterviewScenario {
  const scenario = data as unknown as IntentInterviewScenario;

  // Basic validation
  if (!scenario.id || !scenario.name || !scenario.scenarioVersion) {
    throw new Error(`Invalid scenario: missing required fields (id, name, scenarioVersion)`);
  }
  if (!scenario.userMessages || scenario.userMessages.length === 0) {
    throw new Error(`Scenario ${scenario.id}: must have at least one user message`);
  }
  if (!scenario.expectedAtoms || scenario.expectedAtoms.length === 0) {
    throw new Error(`Scenario ${scenario.id}: must have at least one expected atom`);
  }

  return scenario;
}
