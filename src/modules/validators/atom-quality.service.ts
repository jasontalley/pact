/**
 * Atom Quality Validator Service
 *
 * Evaluates intent atoms against 5 quality dimensions to ensure they meet
 * Pact's standards for testable, implementation-agnostic behavioral primitives.
 *
 * Quality Dimensions (Total: 100 points):
 * - Observable (0-25): Can the behavior be observed and measured?
 * - Falsifiable (0-25): Can we prove this behavior is NOT happening?
 * - Implementation-Agnostic (0-20): Is it free of implementation details?
 * - Unambiguous Language (0-15): Is the wording clear and specific?
 * - Clear Success Criteria (0-15): Is there a clear definition of "done"?
 *
 * Gating Logic:
 * - ≥80: APPROVE - Atom meets quality standards
 * - 60-79: REVISE - Atom needs improvement before commitment
 * - <60: REJECT - Atom does not meet minimum standards
 */

import { Injectable, Logger } from '@nestjs/common';
import { LLMService } from '../../common/llm/llm.service';

export interface QualityDimension {
  name: string;
  maxScore: number;
  score: number;
  feedback: string;
  suggestions: string[];
}

export interface AtomQualityResult {
  totalScore: number;
  decision: 'approve' | 'revise' | 'reject';
  dimensions: {
    observable: QualityDimension;
    falsifiable: QualityDimension;
    implementationAgnostic: QualityDimension;
    unambiguousLanguage: QualityDimension;
    clearSuccessCriteria: QualityDimension;
  };
  overallFeedback: string;
  actionableImprovements: string[];
}

export interface AtomForValidation {
  atomId: string;
  description: string;
  category: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AtomQualityService {
  private readonly logger = new Logger(AtomQualityService.name);

  constructor(private readonly llmService: LLMService) {}

  /**
   * Validates an atom against all 5 quality dimensions
   */
  async validateAtom(atom: AtomForValidation): Promise<AtomQualityResult> {
    this.logger.log(`Validating atom quality: ${atom.atomId}`);

    // Evaluate each dimension
    const [
      observable,
      falsifiable,
      implementationAgnostic,
      unambiguousLanguage,
      clearSuccessCriteria,
    ] = await Promise.all([
      this.evaluateObservable(atom),
      this.evaluateFalsifiable(atom),
      this.evaluateImplementationAgnostic(atom),
      this.evaluateUnambiguousLanguage(atom),
      this.evaluateClearSuccessCriteria(atom),
    ]);

    const dimensions = {
      observable,
      falsifiable,
      implementationAgnostic,
      unambiguousLanguage,
      clearSuccessCriteria,
    };

    // Calculate total score
    const totalScore =
      observable.score +
      falsifiable.score +
      implementationAgnostic.score +
      unambiguousLanguage.score +
      clearSuccessCriteria.score;

    // Determine decision based on gating logic
    const decision = this.determineDecision(totalScore);

    // Generate overall feedback
    const overallFeedback = this.generateOverallFeedback(totalScore, decision, dimensions);

    // Collect actionable improvements from all dimensions
    const actionableImprovements = this.collectActionableImprovements(dimensions);

    const result: AtomQualityResult = {
      totalScore,
      decision,
      dimensions,
      overallFeedback,
      actionableImprovements,
    };

    this.logger.log(
      `Atom ${atom.atomId} quality validation complete: ${totalScore}/100 (${decision})`,
    );

    return result;
  }

  /**
   * Evaluate Observable dimension (0-25)
   * Can the behavior be observed and measured?
   */
  private async evaluateObservable(atom: AtomForValidation): Promise<QualityDimension> {
    const prompt = `Evaluate this intent atom for OBSERVABILITY.

Intent Atom: "${atom.description}"
Category: ${atom.category}

OBSERVABILITY means: Can this behavior be directly observed and measured in the system?
- Does it describe a visible, external behavior (not internal state)?
- Can we write a test that observes this behavior happening?
- Is there a clear trigger and response that can be monitored?

Score Guidelines:
- 25: Clearly observable with well-defined trigger and measurable response
- 20: Observable but trigger or measurement approach needs clarification
- 15: Partially observable, some aspects are internal/hidden
- 10: Difficult to observe, mostly describes internal state
- 5: Very difficult to observe without implementation knowledge
- 0: Not observable, describes internal implementation

Respond in JSON format:
{
  "score": <number 0-25>,
  "feedback": "<one sentence explanation of the score>",
  "suggestions": ["<improvement suggestion 1>", "<improvement suggestion 2>"]
}`;

    try {
      const response = await this.llmService.invoke({
        messages: [
          {
            role: 'system',
            content:
              'You are an expert in behavior-driven development and test design. Evaluate intent atoms for quality.',
          },
          { role: 'user', content: prompt },
        ],
        agentName: 'AtomQualityValidator',
        purpose: 'Evaluating atom quality dimension',
      });

      const parsed = this.parseJsonResponse(response.content);
      return {
        name: 'Observable',
        maxScore: 25,
        score: Math.min(25, Math.max(0, parsed.score || 0)),
        feedback: parsed.feedback || 'Unable to evaluate observability',
        suggestions: parsed.suggestions || [],
      };
    } catch (error) {
      this.logger.warn(`LLM evaluation failed for observable, using heuristic: ${error}`);
      return this.heuristicObservable(atom);
    }
  }

  /**
   * Evaluate Falsifiable dimension (0-25)
   * Can we prove this behavior is NOT happening?
   */
  private async evaluateFalsifiable(atom: AtomForValidation): Promise<QualityDimension> {
    const prompt = `Evaluate this intent atom for FALSIFIABILITY.

Intent Atom: "${atom.description}"
Category: ${atom.category}

FALSIFIABILITY means: Can we write a test that proves this behavior is NOT happening?
- Is there a clear condition that would fail the test?
- Can we define what "violation" of this behavior looks like?
- Are success/failure states clearly distinguishable?

Score Guidelines:
- 25: Clearly falsifiable with well-defined failure conditions
- 20: Falsifiable but failure conditions need more precision
- 15: Partially falsifiable, some edge cases unclear
- 10: Difficult to falsify, vague success/failure criteria
- 5: Very difficult to falsify without subjective judgment
- 0: Not falsifiable, too vague or subjective

Respond in JSON format:
{
  "score": <number 0-25>,
  "feedback": "<one sentence explanation of the score>",
  "suggestions": ["<improvement suggestion 1>", "<improvement suggestion 2>"]
}`;

    try {
      const response = await this.llmService.invoke({
        messages: [
          {
            role: 'system',
            content:
              'You are an expert in behavior-driven development and test design. Evaluate intent atoms for quality.',
          },
          { role: 'user', content: prompt },
        ],
        agentName: 'AtomQualityValidator',
        purpose: 'Evaluating atom quality dimension',
      });

      const parsed = this.parseJsonResponse(response.content);
      return {
        name: 'Falsifiable',
        maxScore: 25,
        score: Math.min(25, Math.max(0, parsed.score || 0)),
        feedback: parsed.feedback || 'Unable to evaluate falsifiability',
        suggestions: parsed.suggestions || [],
      };
    } catch (error) {
      this.logger.warn(`LLM evaluation failed for falsifiable, using heuristic: ${error}`);
      return this.heuristicFalsifiable(atom);
    }
  }

  /**
   * Evaluate Implementation-Agnostic dimension (0-20)
   * Is the atom free of implementation details?
   */
  private async evaluateImplementationAgnostic(atom: AtomForValidation): Promise<QualityDimension> {
    const prompt = `Evaluate this intent atom for being IMPLEMENTATION-AGNOSTIC.

Intent Atom: "${atom.description}"
Category: ${atom.category}

IMPLEMENTATION-AGNOSTIC means: Does this describe WHAT the system does, not HOW it does it?
- Does it avoid mentioning specific technologies (databases, APIs, frameworks)?
- Does it focus on behavior, not architecture or internal design?
- Could this intent be satisfied by different implementations?

Score Guidelines:
- 20: Completely implementation-agnostic, pure behavioral description
- 16: Mostly agnostic, minor implementation hints
- 12: Some implementation details present but core intent is clear
- 8: Significant implementation coupling, limits flexibility
- 4: Heavily tied to specific implementation
- 0: Describes implementation, not behavior

Respond in JSON format:
{
  "score": <number 0-20>,
  "feedback": "<one sentence explanation of the score>",
  "suggestions": ["<improvement suggestion 1>", "<improvement suggestion 2>"]
}`;

    try {
      const response = await this.llmService.invoke({
        messages: [
          {
            role: 'system',
            content:
              'You are an expert in behavior-driven development and test design. Evaluate intent atoms for quality.',
          },
          { role: 'user', content: prompt },
        ],
        agentName: 'AtomQualityValidator',
        purpose: 'Evaluating atom quality dimension',
      });

      const parsed = this.parseJsonResponse(response.content);
      return {
        name: 'Implementation-Agnostic',
        maxScore: 20,
        score: Math.min(20, Math.max(0, parsed.score || 0)),
        feedback: parsed.feedback || 'Unable to evaluate implementation-agnosticism',
        suggestions: parsed.suggestions || [],
      };
    } catch (error) {
      this.logger.warn(
        `LLM evaluation failed for implementation-agnostic, using heuristic: ${error}`,
      );
      return this.heuristicImplementationAgnostic(atom);
    }
  }

  /**
   * Evaluate Unambiguous Language dimension (0-15)
   * Is the wording clear and specific?
   */
  private async evaluateUnambiguousLanguage(atom: AtomForValidation): Promise<QualityDimension> {
    const prompt = `Evaluate this intent atom for UNAMBIGUOUS LANGUAGE.

Intent Atom: "${atom.description}"
Category: ${atom.category}

UNAMBIGUOUS LANGUAGE means: Is the wording clear, specific, and not open to interpretation?
- Does every term have a clear, singular meaning?
- Are there any vague words like "fast", "good", "user-friendly", "efficient"?
- Would two people reading this describe the same behavior?

Score Guidelines:
- 15: Crystal clear, no ambiguity, every term is precise
- 12: Mostly clear, minor clarification might help
- 9: Some ambiguous terms that need definition
- 6: Several vague words or phrases
- 3: Significantly ambiguous, open to interpretation
- 0: Completely vague or subjective

Respond in JSON format:
{
  "score": <number 0-15>,
  "feedback": "<one sentence explanation of the score>",
  "suggestions": ["<improvement suggestion 1>", "<improvement suggestion 2>"]
}`;

    try {
      const response = await this.llmService.invoke({
        messages: [
          {
            role: 'system',
            content:
              'You are an expert in behavior-driven development and test design. Evaluate intent atoms for quality.',
          },
          { role: 'user', content: prompt },
        ],
        agentName: 'AtomQualityValidator',
        purpose: 'Evaluating atom quality dimension',
      });

      const parsed = this.parseJsonResponse(response.content);
      return {
        name: 'Unambiguous Language',
        maxScore: 15,
        score: Math.min(15, Math.max(0, parsed.score || 0)),
        feedback: parsed.feedback || 'Unable to evaluate language clarity',
        suggestions: parsed.suggestions || [],
      };
    } catch (error) {
      this.logger.warn(`LLM evaluation failed for unambiguous language, using heuristic: ${error}`);
      return this.heuristicUnambiguousLanguage(atom);
    }
  }

  /**
   * Evaluate Clear Success Criteria dimension (0-15)
   * Is there a clear definition of "done"?
   */
  private async evaluateClearSuccessCriteria(atom: AtomForValidation): Promise<QualityDimension> {
    const prompt = `Evaluate this intent atom for CLEAR SUCCESS CRITERIA.

Intent Atom: "${atom.description}"
Category: ${atom.category}

CLEAR SUCCESS CRITERIA means: Is there a clear definition of what "success" looks like?
- Can we definitively say "this atom is satisfied" or "this atom is violated"?
- Are there explicit conditions, thresholds, or outcomes defined?
- Is the acceptance criteria binary (pass/fail)?

Score Guidelines:
- 15: Crystal clear success criteria, easily testable pass/fail
- 12: Clear criteria but minor edge cases need definition
- 9: Success is implied but not explicitly stated
- 6: Vague success criteria, needs significant clarification
- 3: Very unclear what "done" means
- 0: No discernible success criteria

Respond in JSON format:
{
  "score": <number 0-15>,
  "feedback": "<one sentence explanation of the score>",
  "suggestions": ["<improvement suggestion 1>", "<improvement suggestion 2>"]
}`;

    try {
      const response = await this.llmService.invoke({
        messages: [
          {
            role: 'system',
            content:
              'You are an expert in behavior-driven development and test design. Evaluate intent atoms for quality.',
          },
          { role: 'user', content: prompt },
        ],
        agentName: 'AtomQualityValidator',
        purpose: 'Evaluating atom quality dimension',
      });

      const parsed = this.parseJsonResponse(response.content);
      return {
        name: 'Clear Success Criteria',
        maxScore: 15,
        score: Math.min(15, Math.max(0, parsed.score || 0)),
        feedback: parsed.feedback || 'Unable to evaluate success criteria',
        suggestions: parsed.suggestions || [],
      };
    } catch (error) {
      this.logger.warn(
        `LLM evaluation failed for clear success criteria, using heuristic: ${error}`,
      );
      return this.heuristicClearSuccessCriteria(atom);
    }
  }

  /**
   * Determine the gating decision based on total score
   */
  private determineDecision(totalScore: number): 'approve' | 'revise' | 'reject' {
    if (totalScore >= 80) {
      return 'approve';
    } else if (totalScore >= 60) {
      return 'revise';
    } else {
      return 'reject';
    }
  }

  /**
   * Generate overall feedback based on the validation results
   */
  private generateOverallFeedback(
    totalScore: number,
    decision: 'approve' | 'revise' | 'reject',
    dimensions: AtomQualityResult['dimensions'],
  ): string {
    const weakestDimensions = Object.entries(dimensions)
      .map(([key, dim]) => ({
        key,
        name: dim.name,
        percentage: (dim.score / dim.maxScore) * 100,
      }))
      .sort((a, b) => a.percentage - b.percentage)
      .slice(0, 2);

    switch (decision) {
      case 'approve':
        return `This atom meets quality standards with a score of ${totalScore}/100. It is ready for commitment.`;
      case 'revise':
        return `This atom scores ${totalScore}/100 and needs improvement before commitment. Focus on improving: ${weakestDimensions.map((d) => d.name).join(' and ')}.`;
      case 'reject':
        return `This atom scores ${totalScore}/100 and does not meet minimum quality standards. Major improvements needed in: ${weakestDimensions.map((d) => d.name).join(' and ')}.`;
    }
  }

  /**
   * Collect all actionable improvements from dimension suggestions
   */
  private collectActionableImprovements(dimensions: AtomQualityResult['dimensions']): string[] {
    const improvements: string[] = [];

    Object.values(dimensions).forEach((dim) => {
      if (dim.score < dim.maxScore * 0.8) {
        improvements.push(...dim.suggestions);
      }
    });

    // Remove duplicates and limit to top 5
    return [...new Set(improvements)].slice(0, 5);
  }

  /**
   * Parse JSON response from LLM, handling markdown code blocks
   */
  private parseJsonResponse(content: string): {
    score: number;
    feedback: string;
    suggestions: string[];
  } {
    try {
      // Remove markdown code blocks if present
      let cleaned = content.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();

      return JSON.parse(cleaned);
    } catch {
      this.logger.warn('Failed to parse LLM response as JSON');
      return { score: 0, feedback: 'Unable to parse evaluation', suggestions: [] };
    }
  }

  // ==================== Heuristic Fallbacks ====================
  // Used when LLM is unavailable or fails

  private heuristicObservable(atom: AtomForValidation): QualityDimension {
    let score = 15; // Start with middle score
    const suggestions: string[] = [];

    // Check for observable verbs
    const observableVerbs =
      /\b(displays?|shows?|returns?|sends?|receives?|responds?|outputs?|produces?|emits?|notifies?)\b/i;
    if (observableVerbs.test(atom.description)) {
      score += 5;
    } else {
      suggestions.push('Use observable verbs like "displays", "returns", or "sends"');
    }

    // Check for internal state words (negative)
    const internalWords = /\b(stores?|caches?|internally|memory|state|flag)\b/i;
    if (internalWords.test(atom.description)) {
      score -= 5;
      suggestions.push('Avoid describing internal state; focus on external behavior');
    }

    // Check for measurable outcomes
    const measurablePatterns =
      /\b(within|less than|more than|at least|exactly|between|\d+\s*(seconds?|ms|minutes?))\b/i;
    if (measurablePatterns.test(atom.description)) {
      score += 5;
    } else {
      suggestions.push('Add measurable criteria like time limits or quantities');
    }

    return {
      name: 'Observable',
      maxScore: 25,
      score: Math.min(25, Math.max(0, score)),
      feedback: 'Evaluated using heuristic rules (LLM unavailable)',
      suggestions,
    };
  }

  private heuristicFalsifiable(atom: AtomForValidation): QualityDimension {
    let score = 15;
    const suggestions: string[] = [];

    // Check for explicit conditions
    const conditionWords = /\b(must|shall|will|when|if|only|always|never)\b/i;
    if (conditionWords.test(atom.description)) {
      score += 5;
    } else {
      suggestions.push('Add explicit conditions using "must", "when", or "if"');
    }

    // Check for vague qualifiers (negative)
    const vagueWords = /\b(usually|sometimes|might|could|may|possibly|probably)\b/i;
    if (vagueWords.test(atom.description)) {
      score -= 5;
      suggestions.push('Remove vague qualifiers; make the behavior deterministic');
    }

    // Check for specific thresholds
    const thresholds = /\b(\d+%?|\d+\.\d+|zero|one|two|three)\b/i;
    if (thresholds.test(atom.description)) {
      score += 5;
    } else {
      suggestions.push('Add specific thresholds or counts to make failure conditions clear');
    }

    return {
      name: 'Falsifiable',
      maxScore: 25,
      score: Math.min(25, Math.max(0, score)),
      feedback: 'Evaluated using heuristic rules (LLM unavailable)',
      suggestions,
    };
  }

  private heuristicImplementationAgnostic(atom: AtomForValidation): QualityDimension {
    let score = 14; // Start with middle-high score
    const suggestions: string[] = [];

    // Check for technology-specific words (negative)
    const techWords =
      /\b(sql|database|api|http|rest|graphql|redis|postgres|mongo|kafka|rabbitmq|jwt|oauth|docker|kubernetes)\b/i;
    if (techWords.test(atom.description)) {
      score -= 6;
      suggestions.push(
        'Remove technology-specific terms; describe the behavior, not the implementation',
      );
    }

    // Check for implementation verbs (negative)
    const implVerbs = /\b(implement|use|using|call|invoke|query|fetch from|store in|cache in)\b/i;
    if (implVerbs.test(atom.description)) {
      score -= 4;
      suggestions.push('Avoid implementation verbs; focus on what the system does for the user');
    }

    // Check for behavior-focused language (positive)
    const behaviorWords = /\b(user|customer|system|allows?|enables?|provides?|ensures?)\b/i;
    if (behaviorWords.test(atom.description)) {
      score += 4;
    }

    return {
      name: 'Implementation-Agnostic',
      maxScore: 20,
      score: Math.min(20, Math.max(0, score)),
      feedback: 'Evaluated using heuristic rules (LLM unavailable)',
      suggestions,
    };
  }

  private heuristicUnambiguousLanguage(atom: AtomForValidation): QualityDimension {
    let score = 10;
    const suggestions: string[] = [];

    // Check for vague adjectives (negative)
    const vagueAdjectives =
      /\b(fast|slow|good|bad|better|worse|nice|efficient|effective|user-friendly|intuitive|simple|easy|quick)\b/i;
    if (vagueAdjectives.test(atom.description)) {
      score -= 4;
      suggestions.push('Replace vague adjectives with specific, measurable criteria');
    }

    // Check for specific terms (positive)
    const specificTerms = /\b(exactly|precisely|within \d+|at least \d+|no more than \d+)\b/i;
    if (specificTerms.test(atom.description)) {
      score += 3;
    }

    // Check description length - too short might be vague, too long might be compound
    const wordCount = atom.description.split(/\s+/).length;
    if (wordCount < 5) {
      score -= 2;
      suggestions.push('Add more detail to clarify the expected behavior');
    } else if (wordCount > 30) {
      score -= 2;
      suggestions.push(
        'Consider splitting this into multiple atoms if it describes multiple behaviors',
      );
    }

    return {
      name: 'Unambiguous Language',
      maxScore: 15,
      score: Math.min(15, Math.max(0, score)),
      feedback: 'Evaluated using heuristic rules (LLM unavailable)',
      suggestions,
    };
  }

  private heuristicClearSuccessCriteria(atom: AtomForValidation): QualityDimension {
    let score = 9;
    const suggestions: string[] = [];

    // Check for success indicators
    const successIndicators =
      /\b(successfully|completes?|confirms?|verified?|validates?|pass(?:es)?|receives?)\b/i;
    if (successIndicators.test(atom.description)) {
      score += 3;
    } else {
      suggestions.push('Add explicit success indicators like "successfully" or "completes"');
    }

    // Check for measurable outcomes
    const measurableOutcomes = /\b(\d+|zero|one|all|none|every|each)\b/i;
    if (measurableOutcomes.test(atom.description)) {
      score += 3;
    } else {
      suggestions.push('Add quantifiable outcomes to define clear success criteria');
    }

    // Check for conditional language indicating clear acceptance
    const conditionalSuccess = /\b(when|given|then|after|before|upon)\b/i;
    if (conditionalSuccess.test(atom.description)) {
      score += 2;
    }

    return {
      name: 'Clear Success Criteria',
      maxScore: 15,
      score: Math.min(15, Math.max(0, score)),
      feedback: 'Evaluated using heuristic rules (LLM unavailable)',
      suggestions,
    };
  }
}
