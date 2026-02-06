import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Atom, ObservableOutcome, FalsifiabilityCriterion } from './atom.entity';
import { LLMService } from '../../common/llm/llm.service';
import { AgentTaskType } from '../../common/llm/providers/types';

export interface AtomSummary {
  id: string;
  atomId: string;
  description: string;
  category: string;
  status: string;
  qualityScore: number | null;
  tags: string[];
}

export interface SemanticDiff {
  atomA: AtomSummary;
  atomB: AtomSummary;
  descriptionDiff: {
    changeType: 'expanded' | 'narrowed' | 'reframed' | 'unchanged';
    summary: string;
  };
  outcomesDiff: {
    added: ObservableOutcome[];
    removed: ObservableOutcome[];
    modified: Array<{ old: ObservableOutcome; new: ObservableOutcome }>;
    unchanged: number;
  };
  falsifiabilityDiff: {
    added: FalsifiabilityCriterion[];
    removed: FalsifiabilityCriterion[];
    modified: Array<{ old: FalsifiabilityCriterion; new: FalsifiabilityCriterion }>;
    unchanged: number;
  };
  categoryDiff: { old: string; new: string } | null;
  qualityDiff: { old: number | null; new: number | null; delta: number } | null;
  tagsDiff: { added: string[]; removed: string[] };
  overallAssessment: string;
}

@Injectable()
export class SemanticDiffService {
  private readonly logger = new Logger(SemanticDiffService.name);

  constructor(
    @InjectRepository(Atom)
    private readonly atomRepository: Repository<Atom>,
    @Optional() private readonly llmService?: LLMService,
  ) {}

  async diff(atomIdA: string, atomIdB: string): Promise<SemanticDiff> {
    const atomA = await this.findAtom(atomIdA);
    const atomB = await this.findAtom(atomIdB);

    // Compute structural diffs
    const outcomesDiff = this.diffOutcomes(
      atomA.observableOutcomes || [],
      atomB.observableOutcomes || [],
    );
    const falsifiabilityDiff = this.diffFalsifiability(
      atomA.falsifiabilityCriteria || [],
      atomB.falsifiabilityCriteria || [],
    );
    const categoryDiff =
      atomA.metadata?.category !== atomB.metadata?.category
        ? {
            old: String(atomA.metadata?.category || 'unknown'),
            new: String(atomB.metadata?.category || 'unknown'),
          }
        : null;
    const qualityDiff = this.diffQuality(atomA.qualityScore, atomB.qualityScore);
    const tagsDiff = this.diffTags(atomA.tags || [], atomB.tags || []);

    // Use LLM for description diff and overall assessment
    let descriptionDiff: SemanticDiff['descriptionDiff'];
    let overallAssessment: string;

    if (this.llmService && atomA.description !== atomB.description) {
      const llmAnalysis = await this.analyzeWithLLM(atomA, atomB);
      descriptionDiff = llmAnalysis.descriptionDiff;
      overallAssessment = llmAnalysis.overallAssessment;
    } else {
      descriptionDiff = {
        changeType: atomA.description === atomB.description ? 'unchanged' : 'reframed',
        summary:
          atomA.description === atomB.description
            ? 'Descriptions are identical.'
            : 'Descriptions differ (LLM analysis not available).',
      };
      overallAssessment = this.generateBasicAssessment(atomA, atomB, outcomesDiff, tagsDiff);
    }

    return {
      atomA: this.toSummary(atomA),
      atomB: this.toSummary(atomB),
      descriptionDiff,
      outcomesDiff,
      falsifiabilityDiff,
      categoryDiff,
      qualityDiff,
      tagsDiff,
      overallAssessment,
    };
  }

  private async findAtom(idOrAtomId: string): Promise<Atom> {
    // Try UUID first, then atomId
    let atom = await this.atomRepository.findOne({ where: { id: idOrAtomId } });
    if (!atom) {
      atom = await this.atomRepository.findOne({ where: { atomId: idOrAtomId } });
    }
    if (!atom) {
      throw new NotFoundException(`Atom "${idOrAtomId}" not found`);
    }
    return atom;
  }

  private toSummary(atom: Atom): AtomSummary {
    return {
      id: atom.id,
      atomId: atom.atomId,
      description: atom.description,
      category: String(atom.metadata?.category || 'unknown'),
      status: atom.status,
      qualityScore: atom.qualityScore ? Number(atom.qualityScore) : null,
      tags: atom.tags || [],
    };
  }

  private diffOutcomes(oldOutcomes: ObservableOutcome[], newOutcomes: ObservableOutcome[]) {
    const added: ObservableOutcome[] = [];
    const removed: ObservableOutcome[] = [];
    const modified: Array<{ old: ObservableOutcome; new: ObservableOutcome }> = [];
    let unchanged = 0;

    // Match outcomes by description similarity
    const matchedNew = new Set<number>();
    for (const oldO of oldOutcomes) {
      let bestMatch = -1;
      let bestSimilarity = 0;
      for (let i = 0; i < newOutcomes.length; i++) {
        if (matchedNew.has(i)) continue;
        const sim = this.stringSimilarity(oldO.description, newOutcomes[i].description);
        if (sim > bestSimilarity) {
          bestSimilarity = sim;
          bestMatch = i;
        }
      }
      if (bestMatch >= 0 && bestSimilarity > 0.5) {
        matchedNew.add(bestMatch);
        if (bestSimilarity < 1.0) {
          modified.push({ old: oldO, new: newOutcomes[bestMatch] });
        } else {
          unchanged++;
        }
      } else {
        removed.push(oldO);
      }
    }
    for (let i = 0; i < newOutcomes.length; i++) {
      if (!matchedNew.has(i)) added.push(newOutcomes[i]);
    }
    return { added, removed, modified, unchanged };
  }

  private diffFalsifiability(
    oldCriteria: FalsifiabilityCriterion[],
    newCriteria: FalsifiabilityCriterion[],
  ) {
    // Same approach as outcomes
    const added: FalsifiabilityCriterion[] = [];
    const removed: FalsifiabilityCriterion[] = [];
    const modified: Array<{ old: FalsifiabilityCriterion; new: FalsifiabilityCriterion }> = [];
    let unchanged = 0;

    const matchedNew = new Set<number>();
    for (const oldC of oldCriteria) {
      let bestMatch = -1;
      let bestSimilarity = 0;
      for (let i = 0; i < newCriteria.length; i++) {
        if (matchedNew.has(i)) continue;
        const sim = this.stringSimilarity(oldC.condition, newCriteria[i].condition);
        if (sim > bestSimilarity) {
          bestSimilarity = sim;
          bestMatch = i;
        }
      }
      if (bestMatch >= 0 && bestSimilarity > 0.5) {
        matchedNew.add(bestMatch);
        if (
          bestSimilarity < 1.0 ||
          oldC.expectedBehavior !== newCriteria[bestMatch].expectedBehavior
        ) {
          modified.push({ old: oldC, new: newCriteria[bestMatch] });
        } else {
          unchanged++;
        }
      } else {
        removed.push(oldC);
      }
    }
    for (let i = 0; i < newCriteria.length; i++) {
      if (!matchedNew.has(i)) added.push(newCriteria[i]);
    }
    return { added, removed, modified, unchanged };
  }

  private diffQuality(oldScore: number | null, newScore: number | null) {
    if (oldScore === null && newScore === null) return null;
    const oldNum = oldScore ? Number(oldScore) : null;
    const newNum = newScore ? Number(newScore) : null;
    return {
      old: oldNum,
      new: newNum,
      delta: (newNum ?? 0) - (oldNum ?? 0),
    };
  }

  private diffTags(oldTags: string[], newTags: string[]) {
    const added = newTags.filter((t) => !oldTags.includes(t));
    const removed = oldTags.filter((t) => !newTags.includes(t));
    return { added, removed };
  }

  /**
   * Simple string similarity using word overlap (Jaccard similarity)
   */
  stringSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  private async analyzeWithLLM(
    atomA: Atom,
    atomB: Atom,
  ): Promise<{
    descriptionDiff: SemanticDiff['descriptionDiff'];
    overallAssessment: string;
  }> {
    try {
      const response = await this.llmService!.invoke({
        messages: [
          {
            role: 'system',
            content: `You are comparing two versions of an intent atom. Analyze the semantic differences between the descriptions.

Respond in JSON format:
{
  "changeType": "expanded" | "narrowed" | "reframed" | "unchanged",
  "summary": "Brief description of what changed",
  "overallAssessment": "Comprehensive assessment of the evolution"
}

Change types:
- "expanded": Scope or coverage increased
- "narrowed": Scope was reduced or made more specific
- "reframed": Core meaning changed without clear expansion/narrowing
- "unchanged": No meaningful difference`,
          },
          {
            role: 'user',
            content: `Atom A description: "${atomA.description}"
Atom B description: "${atomB.description}"

Atom A category: ${atomA.metadata?.category || 'unknown'}
Atom B category: ${atomB.metadata?.category || 'unknown'}

Atom A quality score: ${atomA.qualityScore ?? 'N/A'}
Atom B quality score: ${atomB.qualityScore ?? 'N/A'}`,
          },
        ],
        agentName: 'semantic-diff',
        purpose: 'Compare two atom versions semantically',
        taskType: AgentTaskType.ANALYSIS,
        temperature: 0.2,
      });

      const parsed = JSON.parse(response.content);
      return {
        descriptionDiff: {
          changeType: parsed.changeType || 'reframed',
          summary: parsed.summary || 'Description changed.',
        },
        overallAssessment: parsed.overallAssessment || 'Analysis completed.',
      };
    } catch (error) {
      this.logger.warn(`LLM analysis failed for semantic diff: ${error}`);
      return {
        descriptionDiff: {
          changeType: 'reframed',
          summary: 'Description changed (LLM analysis failed).',
        },
        overallAssessment: this.generateBasicAssessment(
          atomA,
          atomB,
          { added: [], removed: [], modified: [], unchanged: 0 },
          { added: [], removed: [] },
        ),
      };
    }
  }

  private generateBasicAssessment(
    atomA: Atom,
    atomB: Atom,
    outcomesDiff: { added: unknown[]; removed: unknown[]; modified: unknown[]; unchanged: number },
    tagsDiff: { added: string[]; removed: string[] },
  ): string {
    const parts: string[] = [];
    if (atomA.description !== atomB.description) parts.push('Description was modified.');
    if (outcomesDiff.added.length) parts.push(`${outcomesDiff.added.length} outcome(s) added.`);
    if (outcomesDiff.removed.length)
      parts.push(`${outcomesDiff.removed.length} outcome(s) removed.`);
    if (outcomesDiff.modified.length)
      parts.push(`${outcomesDiff.modified.length} outcome(s) modified.`);
    if (tagsDiff.added.length) parts.push(`Tags added: ${tagsDiff.added.join(', ')}.`);
    if (tagsDiff.removed.length) parts.push(`Tags removed: ${tagsDiff.removed.join(', ')}.`);
    if (atomA.qualityScore !== atomB.qualityScore) {
      parts.push(
        `Quality score changed from ${atomA.qualityScore ?? 'N/A'} to ${atomB.qualityScore ?? 'N/A'}.`,
      );
    }
    return parts.length > 0 ? parts.join(' ') : 'No significant changes detected.';
  }
}
