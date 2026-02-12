/**
 * Extract Atoms Node
 *
 * Analyzes the full interview conversation to extract
 * concrete, testable intent atom candidates.
 */

import { NodeConfig } from '../types';
import {
  InterviewGraphStateType,
  AtomCandidate,
  ConversationTurn,
} from '../../types/interview-state';
import { AgentTaskType } from '../../../../../common/llm/providers/types';
import { parseJsonWithRecovery as canonicalParseJson } from '../../../../../common/llm/json-recovery';

export interface ExtractAtomsNodeOptions {
  /** Minimum confidence for inclusion (0-100) */
  minConfidence?: number;
}

const EXTRACTION_PROMPT = `You are an intent atom extractor for the Pact system. Analyze the conversation below and extract testable, atomic behavioral requirements.

Each atom MUST be:
- **Observable**: Has concrete, verifiable outcomes
- **Atomic**: Cannot be meaningfully decomposed further
- **Implementation-agnostic**: Describes behavior, not implementation
- **Testable**: Can be validated with automated tests

## Vocabulary Rules
- Use the EXACT domain terminology from the conversation. If the user says "edit", use "edit" not "modify". If they say "bid", use "bid" not "offer". If they say "appointment", use "appointment" not "booking".
- Each atom description MUST include the key domain noun from the conversation (e.g., "appointment", "inventory", "form", "record", "bid", "payment", "article").
- Do NOT paraphrase domain-specific terms into generic synonyms.

## Description Guidelines
Write descriptions as clear, direct behavioral statements. Use action verbs and specific terminology:
- Good: "User can authenticate with email and password"
- Good: "System maintains user session across requests"
- Good: "System rejects invalid credentials with error message"
- Bad: "System processes login requests" (too vague)
- Bad: "Login works" (not testable)

## Category Decision Rules
- Default to **functional** unless the atom is PRIMARILY about one of the other categories.
- Use **security** ONLY for atoms whose primary purpose is protecting data, controlling access, or authenticating identity. Business workflows that involve security (e.g., payment processing, health records) are still **functional**.
- Use **performance** ONLY for atoms that specify measurable latency, throughput, or response time targets.
- Use **ux** ONLY for atoms about user interface behavior, visual feedback, or accessibility.
- Use **operational** ONLY for atoms about deployment, monitoring, or infrastructure management.

## Atom Count
- Extract as many or as few atoms as the conversation warrants. Do NOT target a specific number.
- Atomicity test: if a description contains "and" connecting two distinct behaviors, split into separate atoms.
- Consolidation test: if two descriptions cover the same behavior at different specificity, keep only the more specific one.

## Output Format
Respond with ONLY valid JSON. No markdown, no code blocks, no commentary before or after the JSON.
Do NOT include code examples, curly braces, or special characters inside string values.
{
  "atoms": [
    {
      "description": "string",
      "category": "functional|performance|security|ux|operational",
      "observableOutcomes": ["string"],
      "confidence": 90,
      "sourceEvidence": ["string"]
    }
  ]
}`;

/**
 * Creates an extract-atoms node.
 */
export function createExtractAtomsNode(options?: ExtractAtomsNodeOptions) {
  const minConfidence = options?.minConfidence ?? 60;

  return (config: NodeConfig) => {
    return async (state: InterviewGraphStateType): Promise<Partial<InterviewGraphStateType>> => {
      const logger = config.logger;
      logger?.log('ExtractAtoms: Extracting atom candidates from conversation...');

      // Build the full conversation context
      const conversationText = buildConversationContext(state);

      try {
        const response = await config.llmService.invoke({
          messages: [
            { role: 'system', content: EXTRACTION_PROMPT },
            { role: 'user', content: conversationText },
          ],
          agentName: 'interview-extract',
          purpose: 'Extract testable intent atoms from interview conversation',
          taskType: AgentTaskType.ATOMIZATION,
          temperature: 0.2,
        });

        let atoms: AtomCandidate[] = [];
        try {
          let content = response.content || '';

          // Remove markdown code blocks if present
          content = content.replaceAll(/```json\s*/gi, '').replaceAll(/```\s*/g, '');

          // Extract and parse JSON with recovery
          const parsed = parseJsonWithRecovery(content, logger);
          atoms = (parsed.atoms || [])
            .filter((a: { confidence?: number }) => (a.confidence ?? 0) >= minConfidence)
            .map(
              (a: {
                description: string;
                category: string;
                observableOutcomes: string[] | string;
                confidence: number;
                sourceEvidence: string[] | string;
              }) =>
                ({
                  description: a.description,
                  category: a.category as AtomCandidate['category'],
                  observableOutcomes: normalizeToArray(a.observableOutcomes),
                  confidence: a.confidence,
                  sourceEvidence: normalizeToArray(a.sourceEvidence),
                }) as AtomCandidate,
            );
        } catch {
          logger?.warn('ExtractAtoms: Failed to parse LLM response');
          atoms = [];
        }

        logger?.log(`ExtractAtoms: Extracted ${atoms.length} atom candidates`);

        const turn: ConversationTurn = {
          role: 'assistant',
          content: `I've identified ${atoms.length} potential intent atom(s) from our conversation.`,
          timestamp: new Date().toISOString(),
        };

        return {
          atomCandidates: atoms,
          currentPhase: 'compose_molecule',
          conversationHistory: [turn],
          llmCallCount: state.llmCallCount + 1,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger?.error(`ExtractAtoms: Error - ${message}`);
        return {
          errors: [message],
          atomCandidates: [],
          currentPhase: 'compose_molecule',
        };
      }
    };
  };
}

/**
 * Normalize a value to a string array. Handles string (semicolon-delimited) or array inputs.
 */
function normalizeToArray(value: string[] | string | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

/**
 * Build the full conversation context for the LLM.
 */
function buildConversationContext(state: InterviewGraphStateType): string {
  const parts: string[] = [`Original Intent: "${state.rawIntent}"`];

  // Include domain context if available
  if (state.scenarioContext) {
    if (state.scenarioContext.domain) {
      parts.push(`Domain: ${state.scenarioContext.domain}`);
    }
    if (state.scenarioContext.constraints && state.scenarioContext.constraints.length > 0) {
      parts.push(`Constraints: ${state.scenarioContext.constraints.join(', ')}`);
    }
    if (state.scenarioContext.invariants && state.scenarioContext.invariants.length > 0) {
      parts.push(`Invariants: ${state.scenarioContext.invariants.join('; ')}`);
    }
  }

  if (state.intentAnalysis) {
    parts.push(
      `\nIntent Analysis:`,
      `- Summary: ${state.intentAnalysis.summary}`,
      `- Implied behaviors: ${state.intentAnalysis.impliedBehaviors.join(', ')}`,
    );
  }

  // Add Q&A pairs
  const answeredQuestions = state.allQuestions.filter((q) => q.answered);
  if (answeredQuestions.length > 0) {
    parts.push('\nClarifying Q&A:');
    for (const q of answeredQuestions) {
      parts.push(`Q [${q.category}]: ${q.question}`);
      parts.push(`A: ${q.response}`);
    }
  }

  parts.push('\nExtract all testable, atomic behavioral requirements from the above conversation.');

  return parts.join('\n');
}

/**
 * Parse JSON from LLM response using canonical recovery + domain-specific fallback.
 *
 * Uses the canonical parseJsonWithRecovery (3-layer: direct, strip fences, repair).
 * Falls back to extracting individual atom objects via regex if canonical fails.
 */
function parseJsonWithRecovery(
  content: string,
  logger?: { log?: (msg: string) => void; warn: (msg: string) => void },
): { atoms: unknown[] } {
  // Use canonical JSON recovery (handles fences, trailing commas, truncation)
  const parsed = canonicalParseJson(content);
  if (parsed && typeof parsed === 'object' && 'atoms' in parsed) {
    return parsed as { atoms: unknown[] };
  }

  // Fallback: extract individual atom objects via regex
  const atoms = extractIndividualAtoms(content, logger);
  if (atoms.length > 0) {
    logger?.log?.(`ExtractAtoms: Recovered ${atoms.length} atom(s) via individual extraction`);
    return { atoms };
  }

  logger?.warn('ExtractAtoms: All JSON parsing layers failed');
  throw new Error('Failed to parse JSON from LLM response');
}

/**
 * Last-resort extraction: find individual atom-like objects in the content.
 */
function extractIndividualAtoms(
  content: string,
  logger?: { warn: (msg: string) => void },
): unknown[] {
  const atoms: unknown[] = [];
  // Match objects that have a "description" field — likely atom objects
  const atomPattern = /\{[^{}]*"description"\s*:\s*"[^"]+?"[^{}]*\}/g;
  const matches = content.match(atomPattern);

  if (!matches) return atoms;

  for (const match of matches) {
    try {
      // Try to fix common issues in the individual object
      let fixed = match.replaceAll(/,\s*}/g, '}');
      fixed = fixed.replaceAll(/,\s*]/g, ']');
      const obj = JSON.parse(fixed);
      if (obj.description && typeof obj.description === 'string') {
        atoms.push(obj);
      }
    } catch {
      // Skip unparseable individual objects
    }
  }

  if (matches.length > 0 && atoms.length === 0) {
    logger?.warn(`ExtractAtoms: Found ${matches.length} atom-like objects but none parsed`);
  }

  return atoms;
}
