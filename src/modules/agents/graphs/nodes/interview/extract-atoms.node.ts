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

For each atom, provide:
- description: Clear behavioral statement
- category: One of functional, performance, security, ux, operational
- observableOutcomes: List of verifiable outcomes
- confidence: 0-100 how confident you are this is a valid, well-defined atom
- sourceEvidence: Quotes or references from the conversation supporting this atom

Respond ONLY with valid JSON:
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
          const content = response.content || '';
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
          atoms = (parsed.atoms || [])
            .filter((a: { confidence?: number }) => (a.confidence ?? 0) >= minConfidence)
            .map(
              (a: {
                description: string;
                category: string;
                observableOutcomes: string[];
                confidence: number;
                sourceEvidence: string[];
              }) =>
                ({
                  description: a.description,
                  category: a.category as AtomCandidate['category'],
                  observableOutcomes: a.observableOutcomes || [],
                  confidence: a.confidence,
                  sourceEvidence: a.sourceEvidence || [],
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
 * Build the full conversation context for the LLM.
 */
function buildConversationContext(state: InterviewGraphStateType): string {
  const parts: string[] = [`Original Intent: "${state.rawIntent}"`];

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
