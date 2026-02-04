/**
 * Compose Molecule Node
 *
 * Final node in the interview graph. Groups extracted atom
 * candidates into logical molecule(s) and produces the
 * final output summary.
 */

import { NodeConfig } from '../types';
import {
  InterviewGraphStateType,
  MoleculeCandidate,
  ConversationTurn,
} from '../../types/interview-state';
import { AgentTaskType } from '../../../../../common/llm/providers/types';

export interface ComposeMoleculeNodeOptions {
  /** Default lens type for composed molecules */
  defaultLensType?: string;
}

const COMPOSITION_PROMPT = `You are a molecule composer for the Pact system. Given a set of extracted intent atoms, group them into logical molecules (features, user stories, etc.).

A molecule is a human-readable grouping that helps people understand how atoms relate. Molecules are "lenses" — they don't define truth, they help organize it.

Guidelines:
- Group atoms that work together to deliver a coherent capability
- A molecule with 1-3 atoms is fine (don't over-group)
- Each atom can belong to multiple molecules
- Choose appropriate lens types: user_story, feature, journey, capability

Respond ONLY with valid JSON:
{
  "molecules": [
    {
      "name": "string",
      "description": "string",
      "lensType": "user_story|feature|journey|capability",
      "atomIndices": [0, 1]
    }
  ]
}`;

/**
 * Creates a compose-molecule node.
 */
export function createComposeMoleculeNode(options?: ComposeMoleculeNodeOptions) {
  const defaultLensType = options?.defaultLensType ?? 'feature';

  return (config: NodeConfig) => {
    return async (state: InterviewGraphStateType): Promise<Partial<InterviewGraphStateType>> => {
      const logger = config.logger;
      const atoms = state.atomCandidates || [];

      if (atoms.length === 0) {
        logger?.log('ComposeMolecule: No atoms to compose');
        return {
          currentPhase: 'complete',
          output: 'No testable atoms could be extracted from the conversation.',
          moleculeCandidates: [],
        };
      }

      logger?.log(`ComposeMolecule: Composing molecules from ${atoms.length} atoms`);

      try {
        const atomList = atoms
          .map((a, i) => `[${i}] ${a.description} (${a.category}, confidence: ${a.confidence}%)`)
          .join('\n');

        const response = await config.llmService.invoke({
          messages: [
            { role: 'system', content: COMPOSITION_PROMPT },
            {
              role: 'user',
              content: `Original intent: "${state.rawIntent}"\n\nExtracted atoms:\n${atomList}\n\nGroup these into logical molecules.`,
            },
          ],
          agentName: 'interview-compose',
          purpose: 'Group extracted atoms into molecules',
          taskType: AgentTaskType.ANALYSIS,
          temperature: 0.3,
        });

        let molecules: MoleculeCandidate[] = [];
        try {
          const content = response.content || '';
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
          molecules = (parsed.molecules || []).map(
            (m: { name: string; description: string; lensType?: string; atomIndices: number[] }) =>
              ({
                name: m.name,
                description: m.description,
                lensType: m.lensType || defaultLensType,
                atomIndices: m.atomIndices,
              }) as MoleculeCandidate,
          );
        } catch {
          logger?.warn('ComposeMolecule: Failed to parse LLM response, using default grouping');
          // Default: one molecule containing all atoms
          molecules = [
            {
              name: state.intentAnalysis?.summary || state.rawIntent.slice(0, 100),
              description: state.rawIntent,
              lensType: defaultLensType,
              atomIndices: atoms.map((_, i) => i),
            },
          ];
        }

        // Build the output summary
        const output = buildOutputSummary(state.rawIntent, atoms, molecules);

        const turn: ConversationTurn = {
          role: 'assistant',
          content: output,
          timestamp: new Date().toISOString(),
        };

        return {
          moleculeCandidates: molecules,
          currentPhase: 'complete',
          output,
          conversationHistory: [turn],
          llmCallCount: state.llmCallCount + 1,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger?.error(`ComposeMolecule: Error - ${message}`);

        // Fallback: one molecule with all atoms
        const fallbackMolecule: MoleculeCandidate = {
          name: state.rawIntent.slice(0, 100),
          description: state.rawIntent,
          lensType: defaultLensType,
          atomIndices: atoms.map((_, i) => i),
        };

        return {
          errors: [message],
          moleculeCandidates: [fallbackMolecule],
          currentPhase: 'complete',
          output: buildOutputSummary(state.rawIntent, atoms, [fallbackMolecule]),
        };
      }
    };
  };
}

function buildOutputSummary(
  rawIntent: string,
  atoms: { description: string; category: string; confidence: number }[],
  molecules: MoleculeCandidate[],
): string {
  const lines: string[] = [
    `## Interview Results\n`,
    `**Original Intent**: ${rawIntent}\n`,
    `### Extracted Atoms (${atoms.length})\n`,
  ];

  atoms.forEach((a, i) => {
    lines.push(`${i + 1}. **${a.description}** [${a.category}, ${a.confidence}% confidence]`);
  });

  lines.push(`\n### Suggested Molecules (${molecules.length})\n`);
  molecules.forEach((m) => {
    const atomRefs = m.atomIndices.map((i) => `#${i + 1}`).join(', ');
    lines.push(`- **${m.name}** (${m.lensType}) — atoms: ${atomRefs}`);
    lines.push(`  ${m.description}`);
  });

  return lines.join('\n');
}
