import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Atom, RefinementRecord } from '../atoms/atom.entity';
import { AtomicityCheckerService, AtomicityResult } from './atomicity-checker.service';
import { AtomQualityService } from '../validators/atom-quality.service';
import { LLMService } from '../../common/llm/llm.service';
import { parseJsonWithRecovery } from '../../common/llm/json-recovery';

/**
 * Analysis result for raw intent
 */
export interface IntentAnalysisResult {
  atomicity: 'atomic' | 'non-atomic' | 'ambiguous';
  confidence: number;
  violations: string[];
  clarifyingQuestions: string[];
  decompositionSuggestions: string[];
  precisionImprovements: string[];
  qualityPreview?: {
    estimatedScore: number;
    decision: 'approve' | 'revise' | 'reject';
  };
}

/**
 * Refinement suggestion from AI
 */
export interface RefinementSuggestion {
  id: string;
  type: 'clarification' | 'decomposition' | 'precision' | 'rewrite';
  original: string;
  suggested: string;
  reasoning: string;
  confidence: number;
}

/**
 * Result of applying refinement
 */
export interface RefinementResult {
  success: boolean;
  atom: {
    id: string;
    atomId: string;
    description: string;
    qualityScore: number | null;
  };
  previousDescription: string;
  refinementRecord: RefinementRecord;
  newQualityScore?: number;
  message: string;
}

/**
 * IntentRefinementService
 *
 * Provides AI-powered iterative refinement of intent atoms.
 * Supports:
 * - Analyzing raw intents for atomicity
 * - Suggesting refinements (clarifications, decompositions, precision improvements)
 * - Applying refinements with history tracking
 * - Re-evaluating quality after each refinement
 */
@Injectable()
export class IntentRefinementService {
  private readonly logger = new Logger(IntentRefinementService.name);

  constructor(
    @InjectRepository(Atom)
    private readonly atomRepository: Repository<Atom>,
    private readonly atomicityChecker: AtomicityCheckerService,
    private readonly atomQualityService: AtomQualityService,
    @Optional() private readonly llmService?: LLMService,
  ) {}

  /**
   * Analyze a raw intent for atomicity and quality
   *
   * @param rawIntent - The intent description to analyze
   * @returns Analysis with atomicity assessment and suggestions
   */
  async analyzeIntent(rawIntent: string): Promise<IntentAnalysisResult> {
    this.logger.log(`Analyzing intent: "${rawIntent.substring(0, 50)}..."`);

    // Run atomicity check with heuristics
    const atomicityResult = await this.atomicityChecker.checkAtomicity(rawIntent, {
      useLLM: !!this.llmService,
    });

    // Generate suggestions based on violations
    const clarifyingQuestions = this.generateClarifyingQuestions(rawIntent, atomicityResult);
    const decompositionSuggestions = this.generateDecompositionSuggestions(
      rawIntent,
      atomicityResult,
    );
    const precisionImprovements = this.generatePrecisionImprovements(rawIntent, atomicityResult);

    // Preview quality score
    let qualityPreview: IntentAnalysisResult['qualityPreview'] | undefined;
    try {
      const qualityResult = await this.atomQualityService.validateAtom({
        atomId: 'preview',
        description: rawIntent,
        category: 'functional',
      });
      qualityPreview = {
        estimatedScore: qualityResult.totalScore,
        decision: qualityResult.decision,
      };
    } catch (error) {
      this.logger.warn(`Quality preview failed: ${error.message}`);
    }

    // Determine atomicity classification
    let atomicity: IntentAnalysisResult['atomicity'];
    if (atomicityResult.isAtomic && atomicityResult.confidence >= 0.8) {
      atomicity = 'atomic';
    } else if (!atomicityResult.isAtomic && atomicityResult.confidence >= 0.8) {
      atomicity = 'non-atomic';
    } else {
      atomicity = 'ambiguous';
    }

    return {
      atomicity,
      confidence: atomicityResult.confidence,
      violations: atomicityResult.violations,
      clarifyingQuestions,
      decompositionSuggestions,
      precisionImprovements,
      qualityPreview,
    };
  }

  /**
   * Generate refinement suggestions for an intent
   *
   * @param intent - The intent to generate suggestions for
   * @returns Array of refinement suggestions
   */
  async suggestRefinements(intent: string): Promise<RefinementSuggestion[]> {
    this.logger.log(`Generating refinement suggestions for: "${intent.substring(0, 50)}..."`);

    const suggestions: RefinementSuggestion[] = [];
    const atomicityResult = await this.atomicityChecker.checkAtomicity(intent);

    // Generate suggestions based on heuristic failures
    if (!atomicityResult.heuristicScores.singleResponsibility.passed) {
      suggestions.push(...(await this.suggestDecomposition(intent)));
    }

    if (!atomicityResult.heuristicScores.observableOutcome.passed) {
      suggestions.push(this.suggestObservableRewrite(intent));
    }

    if (!atomicityResult.heuristicScores.implementationAgnostic.passed) {
      suggestions.push(this.suggestImplementationAgnosticRewrite(intent));
    }

    if (!atomicityResult.heuristicScores.measurableCriteria.passed) {
      suggestions.push(this.suggestMeasurableCriteria(intent));
    }

    // If LLM available, get AI-powered suggestions
    if (this.llmService && suggestions.length < 3) {
      try {
        const llmSuggestions = await this.getLLMSuggestions(intent, atomicityResult);
        suggestions.push(...llmSuggestions);
      } catch (error) {
        this.logger.warn(`LLM suggestions failed: ${error.message}`);
      }
    }

    return suggestions;
  }

  /**
   * Refine an existing atom with user feedback
   *
   * @param atomId - UUID or atomId of the atom to refine
   * @param feedback - User feedback or new description
   * @returns Refinement result with updated atom
   */
  async refineAtom(atomId: string, feedback: string): Promise<RefinementResult> {
    // Find the atom
    const atom = await this.atomRepository.findOne({
      where: [{ id: atomId }, { atomId: atomId }],
    });

    if (!atom) {
      throw new NotFoundException(`Atom with ID ${atomId} not found`);
    }

    if (atom.status !== 'draft') {
      throw new Error(
        `Cannot refine atom with status '${atom.status}'. Only draft atoms can be refined.`,
      );
    }

    const previousDescription = atom.description;
    this.logger.log(`Refining atom ${atom.atomId}: "${previousDescription.substring(0, 30)}..."`);

    // Determine if feedback is a direct replacement or needs interpretation
    let newDescription: string;
    if (feedback.length > 20 && !feedback.toLowerCase().startsWith('change')) {
      // Treat as direct replacement
      newDescription = feedback;
    } else {
      // Interpret feedback and generate new description
      newDescription = await this.interpretFeedback(previousDescription, feedback);
    }

    // Create refinement record
    const refinementRecord: RefinementRecord = {
      timestamp: new Date(),
      previousDescription,
      newDescription,
      feedback,
      source: this.llmService ? 'ai' : 'system',
    };

    // Update atom
    atom.description = newDescription;
    atom.refinementHistory = [...(atom.refinementHistory || []), refinementRecord];

    // Re-evaluate quality
    let newQualityScore: number | undefined;
    try {
      const qualityResult = await this.atomQualityService.validateAtom({
        atomId: atom.atomId,
        description: newDescription,
        category: atom.category,
      });
      newQualityScore = qualityResult.totalScore;
      atom.qualityScore = newQualityScore;
    } catch (error) {
      this.logger.warn(`Quality re-evaluation failed: ${error.message}`);
    }

    // Save updated atom
    const savedAtom = await this.atomRepository.save(atom);

    return {
      success: true,
      atom: {
        id: savedAtom.id,
        atomId: savedAtom.atomId,
        description: savedAtom.description,
        qualityScore: savedAtom.qualityScore,
      },
      previousDescription,
      refinementRecord,
      newQualityScore,
      message: `Atom ${savedAtom.atomId} refined successfully. Refinement count: ${savedAtom.refinementHistory.length}`,
    };
  }

  /**
   * Get refinement history for an atom
   */
  async getRefinementHistory(atomId: string): Promise<RefinementRecord[]> {
    const atom = await this.atomRepository.findOne({
      where: [{ id: atomId }, { atomId: atomId }],
    });

    if (!atom) {
      throw new NotFoundException(`Atom with ID ${atomId} not found`);
    }

    return atom.refinementHistory || [];
  }

  /**
   * Accept a specific suggestion and apply it to an atom
   */
  async acceptSuggestion(
    atomId: string,
    suggestion: RefinementSuggestion,
  ): Promise<RefinementResult> {
    return this.refineAtom(atomId, suggestion.suggested);
  }

  // --- Private helper methods ---

  private generateClarifyingQuestions(intent: string, result: AtomicityResult): string[] {
    const questions: string[] = [];

    if (!result.heuristicScores.observableOutcome.passed) {
      questions.push('How will users or systems observe this behavior?');
      questions.push('What external effect does this produce?');
    }

    if (!result.heuristicScores.measurableCriteria.passed) {
      questions.push('What specific threshold or count defines success?');
      questions.push('How long should this operation take at maximum?');
    }

    if (!result.heuristicScores.reasonableScope.passed) {
      if (intent.length < 30) {
        questions.push('Can you provide more detail about what this entails?');
      } else {
        questions.push('Can this be narrowed to a specific user action or system response?');
      }
    }

    return questions.slice(0, 3); // Limit to 3 questions
  }

  private generateDecompositionSuggestions(intent: string, result: AtomicityResult): string[] {
    if (result.heuristicScores.singleResponsibility.passed) {
      return [];
    }

    // Simple heuristic: split on "and" or "or"
    const parts = intent.split(/\s+(?:and|or)\s+/i);
    if (parts.length > 1) {
      return parts.map((p) => p.trim()).filter((p) => p.length > 10);
    }

    return [];
  }

  private generatePrecisionImprovements(intent: string, result: AtomicityResult): string[] {
    const improvements: string[] = [];

    if (!result.heuristicScores.measurableCriteria.passed) {
      improvements.push('Add a specific time constraint (e.g., "within 3 seconds")');
      improvements.push('Add a count or threshold (e.g., "at least 3 attempts")');
    }

    if (!result.heuristicScores.implementationAgnostic.passed) {
      improvements.push('Remove technology-specific terms and describe the behavior instead');
    }

    return improvements;
  }

  private async suggestDecomposition(intent: string): Promise<RefinementSuggestion[]> {
    const parts = intent.split(/\s+(?:and|or)\s+/i);
    if (parts.length <= 1) {
      return [];
    }

    return parts.map((part, index) => ({
      id: `decomp-${index}`,
      type: 'decomposition' as const,
      original: intent,
      suggested: part.trim(),
      reasoning: 'Split compound intent into separate atomic behaviors',
      confidence: 0.8,
    }));
  }

  private suggestObservableRewrite(intent: string): RefinementSuggestion {
    return {
      id: 'observable-rewrite',
      type: 'precision' as const,
      original: intent,
      suggested: `System displays confirmation when ${intent.toLowerCase()}`,
      reasoning: 'Added observable outcome (display confirmation)',
      confidence: 0.6,
    };
  }

  private suggestImplementationAgnosticRewrite(intent: string): RefinementSuggestion {
    // Simple heuristic: remove common tech terms
    let cleaned = intent;
    const techTerms = ['using', 'via', 'through', 'api', 'database', 'sql'];
    for (const term of techTerms) {
      cleaned = cleaned.replace(new RegExp(`\\s*${term}\\s+\\S+`, 'gi'), '');
    }

    return {
      id: 'impl-agnostic-rewrite',
      type: 'rewrite' as const,
      original: intent,
      suggested: cleaned.trim() || intent,
      reasoning: 'Removed implementation-specific terms',
      confidence: 0.5,
    };
  }

  private suggestMeasurableCriteria(intent: string): RefinementSuggestion {
    return {
      id: 'measurable-criteria',
      type: 'precision' as const,
      original: intent,
      suggested: `${intent} within 5 seconds`,
      reasoning: 'Added measurable time constraint',
      confidence: 0.6,
    };
  }

  private async getLLMSuggestions(
    intent: string,
    atomicityResult: AtomicityResult,
  ): Promise<RefinementSuggestion[]> {
    if (!this.llmService) {
      return [];
    }

    const systemPrompt = `You are an expert at refining software intent descriptions.
Given an intent and its issues, suggest improved versions.
Focus on making intents: atomic, observable, testable, and implementation-agnostic.
Respond in JSON format only.`;

    const userPrompt = `Intent: "${intent}"
Issues: ${atomicityResult.violations.join(', ') || 'None'}

Suggest up to 2 improved versions.
Respond with JSON array:
[{
  "suggested": "improved intent text",
  "reasoning": "why this is better",
  "confidence": 0.0-1.0
}]`;

    try {
      const response = await this.llmService.invoke({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        agentName: 'intent-refinement',
        purpose: 'Generate refinement suggestions',
        temperature: 0.3,
      });

      const parsed = parseJsonWithRecovery(response.content);
      if (!parsed || !Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((s: any, index: number) => ({
        id: `llm-${index}`,
        type: 'rewrite' as const,
        original: intent,
        suggested: s.suggested,
        reasoning: s.reasoning,
        confidence: s.confidence,
      }));
    } catch (error) {
      this.logger.warn(`Failed to get LLM suggestions: ${error.message}`);
      return [];
    }
  }

  private async interpretFeedback(currentDescription: string, feedback: string): Promise<string> {
    // If LLM available, use it to interpret feedback
    if (this.llmService) {
      try {
        const response = await this.llmService.invoke({
          messages: [
            {
              role: 'system',
              content:
                'You rewrite intent descriptions based on feedback. Return ONLY the new description.',
            },
            {
              role: 'user',
              content: `Current: "${currentDescription}"\nFeedback: "${feedback}"\n\nNew description:`,
            },
          ],
          agentName: 'intent-refinement',
          purpose: 'Interpret refinement feedback',
          temperature: 0.2,
        });

        return response.content.trim().replace(/^["']|["']$/g, '');
      } catch (error) {
        this.logger.warn(`LLM feedback interpretation failed: ${error.message}`);
      }
    }

    // Fallback: simple keyword-based interpretation
    if (feedback.toLowerCase().includes('add time')) {
      return `${currentDescription} within 5 seconds`;
    }
    if (feedback.toLowerCase().includes('more specific')) {
      return `${currentDescription} for the current user`;
    }
    if (feedback.toLowerCase().includes('observable')) {
      return `System displays result when ${currentDescription.toLowerCase()}`;
    }

    // If can't interpret, return the feedback as the new description
    return feedback;
  }
}
