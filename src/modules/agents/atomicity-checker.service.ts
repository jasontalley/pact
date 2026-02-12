import { Injectable, Logger, Optional } from '@nestjs/common';
import { LLMService } from '../../common/llm/llm.service';
import { parseJsonWithRecovery } from '../../common/llm/json-recovery';

/**
 * Result of atomicity analysis
 */
export interface AtomicityResult {
  isAtomic: boolean;
  confidence: number;
  violations: string[];
  suggestions: string[];
  heuristicScores: {
    singleResponsibility: HeuristicScore;
    observableOutcome: HeuristicScore;
    implementationAgnostic: HeuristicScore;
    measurableCriteria: HeuristicScore;
    reasonableScope: HeuristicScore;
  };
  llmAnalysis?: LLMAtomicityAnalysis;
}

export interface HeuristicScore {
  passed: boolean;
  score: number;
  maxScore: number;
  feedback: string;
}

export interface LLMAtomicityAnalysis {
  behavioralCompleteness: number;
  testabilityAssessment: number;
  ambiguityScore: number;
  reasoning: string;
}

/**
 * Word lists for heuristic checks
 */
const COMPOUND_CONJUNCTIONS = ['and', 'or', 'also', 'as well as', 'along with', 'plus'];
const OBSERVABLE_VERBS = [
  'display',
  'show',
  'return',
  'send',
  'receive',
  'respond',
  'output',
  'emit',
  'notify',
  'produce',
  'generate',
  'create',
  'present',
  'render',
  'log',
];
const TECH_IMPLEMENTATION_TERMS = [
  'sql',
  'database',
  'api',
  'http',
  'https',
  'rest',
  'graphql',
  'redis',
  'postgres',
  'mysql',
  'mongo',
  'kafka',
  'rabbitmq',
  'jwt',
  'oauth',
  'docker',
  'kubernetes',
  'aws',
  'azure',
  'gcp',
  'lambda',
  's3',
  'elasticsearch',
  'json',
  'xml',
  'csv',
  'tcp',
  'udp',
  'websocket',
  'grpc',
];
const IMPLEMENTATION_PHRASES = [
  'using',
  'via',
  'through',
  'by calling',
  'by invoking',
  'by querying',
  'implemented with',
  'stored in',
  'cached in',
  'fetched from',
];
const MEASURABLE_INDICATORS = [
  'within',
  'less than',
  'more than',
  'at least',
  'at most',
  'exactly',
  'between',
  'maximum',
  'minimum',
  'percent',
  '%',
  'seconds',
  'minutes',
  'milliseconds',
  'bytes',
  'times',
  'attempts',
];
const VAGUE_QUALIFIERS = [
  'fast',
  'slow',
  'quick',
  'efficient',
  'good',
  'bad',
  'better',
  'proper',
  'appropriate',
  'adequate',
  'reasonable',
  'sufficient',
  'usually',
  'sometimes',
  'often',
  'might',
  'could',
  'possibly',
  'probably',
];
const TOO_BROAD_INDICATORS = [
  'all',
  'every',
  'any',
  'entire',
  'whole',
  'complete system',
  'everything',
  'always',
  'never',
];
const TOO_NARROW_INDICATORS = [
  'specific field',
  'single character',
  'one pixel',
  'exact byte',
  'only on tuesdays',
];

/**
 * AtomicityCheckerService
 *
 * Evaluates whether an intent description represents an atomic behavioral primitive.
 * Uses both heuristic checks (fast, deterministic) and optional LLM analysis (deep, nuanced).
 *
 * Heuristic Checks:
 * 1. Single Responsibility - No compound statements (and/or)
 * 2. Observable Outcome - Behavior can be observed externally
 * 3. Implementation-Agnostic - Describes WHAT not HOW
 * 4. Measurable Criteria - Has quantifiable success conditions
 * 5. Reasonable Scope - Not too broad or too narrow
 */
@Injectable()
export class AtomicityCheckerService {
  private readonly logger = new Logger(AtomicityCheckerService.name);

  constructor(@Optional() private readonly llmService?: LLMService) {}

  /**
   * Check if an intent description is atomic
   *
   * @param description - The intent description to analyze
   * @param options - Analysis options
   * @returns AtomicityResult with detailed breakdown
   */
  async checkAtomicity(
    description: string,
    options: { useLLM?: boolean } = {},
  ): Promise<AtomicityResult> {
    const { useLLM = false } = options;

    this.logger.log(`Checking atomicity: "${description.substring(0, 50)}..."`);

    // Run all heuristic checks
    const heuristicScores = {
      singleResponsibility: this.checkSingleResponsibility(description),
      observableOutcome: this.checkObservableOutcome(description),
      implementationAgnostic: this.checkImplementationAgnostic(description),
      measurableCriteria: this.checkMeasurableCriteria(description),
      reasonableScope: this.checkReasonableScope(description),
    };

    // Calculate total heuristic score
    const totalScore = Object.values(heuristicScores).reduce((sum, s) => sum + s.score, 0);
    const maxScore = Object.values(heuristicScores).reduce((sum, s) => sum + s.maxScore, 0);
    const heuristicConfidence = totalScore / maxScore;

    // Collect violations and suggestions
    const violations: string[] = [];
    const suggestions: string[] = [];

    for (const [name, score] of Object.entries(heuristicScores)) {
      if (!score.passed) {
        violations.push(`${this.formatHeuristicName(name)}: ${score.feedback}`);
      }
    }

    // Generate suggestions based on violations
    if (!heuristicScores.singleResponsibility.passed) {
      suggestions.push(
        'Consider splitting this intent into multiple atoms, one for each distinct behavior.',
      );
    }
    if (!heuristicScores.observableOutcome.passed) {
      suggestions.push(
        'Add observable verbs like "display", "return", "notify" to describe external effects.',
      );
    }
    if (!heuristicScores.implementationAgnostic.passed) {
      suggestions.push(
        'Remove technology-specific terms and focus on the behavior, not the implementation.',
      );
    }
    if (!heuristicScores.measurableCriteria.passed) {
      suggestions.push(
        'Add specific measurements like timeouts, thresholds, or counts to make success verifiable.',
      );
    }
    if (!heuristicScores.reasonableScope.passed) {
      suggestions.push(
        'Adjust the scope to be neither too broad (system-wide) nor too narrow (trivial detail).',
      );
    }

    // Determine if atomic based on heuristics
    let isAtomic = violations.length === 0;
    let confidence = heuristicConfidence;
    let llmAnalysis: LLMAtomicityAnalysis | undefined;

    // Optional: Deep LLM analysis
    if (useLLM && this.llmService) {
      try {
        llmAnalysis = await this.performLLMAnalysis(description);

        // Combine heuristic and LLM confidence
        const llmConfidence =
          (llmAnalysis.behavioralCompleteness +
            llmAnalysis.testabilityAssessment +
            (1 - llmAnalysis.ambiguityScore)) /
          3;

        // Weight: 60% heuristic, 40% LLM
        confidence = heuristicConfidence * 0.6 + llmConfidence * 0.4;

        // LLM can override heuristic decision if confidence is high
        if (llmConfidence > 0.8 && violations.length <= 1) {
          isAtomic = true;
        } else if (llmConfidence < 0.4) {
          isAtomic = false;
          if (!violations.includes('LLM Analysis: Low testability or behavioral completeness')) {
            violations.push('LLM Analysis: Low testability or behavioral completeness');
          }
        }
      } catch (error) {
        this.logger.warn(`LLM analysis failed, using heuristics only: ${error.message}`);
      }
    }

    const result: AtomicityResult = {
      isAtomic,
      confidence: Math.round(confidence * 100) / 100,
      violations,
      suggestions,
      heuristicScores,
      llmAnalysis,
    };

    this.logger.log(
      `Atomicity check complete: isAtomic=${isAtomic}, confidence=${result.confidence}`,
    );

    return result;
  }

  /**
   * Check 1: Single Responsibility
   * Intent should not have compound behaviors (no "and", "or")
   */
  private checkSingleResponsibility(description: string): HeuristicScore {
    const lowerDesc = description.toLowerCase();
    const words = lowerDesc.split(/\s+/);

    let compoundCount = 0;
    for (const conjunction of COMPOUND_CONJUNCTIONS) {
      // Check for conjunction as standalone word or phrase
      if (conjunction.includes(' ')) {
        if (lowerDesc.includes(conjunction)) {
          compoundCount++;
        }
      } else {
        // Check for word boundaries
        const index = words.indexOf(conjunction);
        if (index > 0 && index < words.length - 1) {
          // "and" or "or" in the middle indicates compound
          compoundCount++;
        }
      }
    }

    const passed = compoundCount === 0;
    const score = passed ? 20 : Math.max(0, 20 - compoundCount * 10);

    return {
      passed,
      score,
      maxScore: 20,
      feedback: passed
        ? 'Intent describes a single responsibility'
        : `Found ${compoundCount} compound conjunction(s) suggesting multiple behaviors`,
    };
  }

  /**
   * Check 2: Observable Outcome
   * Intent should describe externally observable behavior
   */
  private checkObservableOutcome(description: string): HeuristicScore {
    const lowerDesc = description.toLowerCase();

    let observableCount = 0;
    for (const verb of OBSERVABLE_VERBS) {
      if (lowerDesc.includes(verb)) {
        observableCount++;
      }
    }

    // Check for "user can see/verify/observe" patterns
    const observablePatterns = [
      /user\s+(can\s+)?(see|view|observe|verify|confirm)/i,
      /system\s+(will\s+)?(display|show|return|send|respond)/i,
      /\b(visible|displayed|shown|returned|sent|received)\b/i,
    ];

    for (const pattern of observablePatterns) {
      if (pattern.test(description)) {
        observableCount++;
      }
    }

    const passed = observableCount > 0;
    const score = Math.min(20, observableCount * 10);

    return {
      passed,
      score,
      maxScore: 20,
      feedback: passed
        ? 'Intent has observable outcomes'
        : 'No observable verbs or patterns found - behavior may not be externally verifiable',
    };
  }

  /**
   * Check 3: Implementation-Agnostic
   * Intent should not mention specific technologies
   */
  private checkImplementationAgnostic(description: string): HeuristicScore {
    const lowerDesc = description.toLowerCase();

    const techTermsFound: string[] = [];
    for (const term of TECH_IMPLEMENTATION_TERMS) {
      if (lowerDesc.includes(term)) {
        techTermsFound.push(term);
      }
    }

    const implPhrasesFound: string[] = [];
    for (const phrase of IMPLEMENTATION_PHRASES) {
      if (lowerDesc.includes(phrase)) {
        implPhrasesFound.push(phrase);
      }
    }

    const totalViolations = techTermsFound.length + implPhrasesFound.length;
    const passed = totalViolations === 0;
    const score = Math.max(0, 20 - totalViolations * 5);

    let feedback = 'Intent is implementation-agnostic';
    if (!passed) {
      const issues: string[] = [];
      if (techTermsFound.length > 0) {
        issues.push(`technology terms: ${techTermsFound.join(', ')}`);
      }
      if (implPhrasesFound.length > 0) {
        issues.push(`implementation phrases: ${implPhrasesFound.join(', ')}`);
      }
      feedback = `Found ${issues.join('; ')}`;
    }

    return {
      passed,
      score,
      maxScore: 20,
      feedback,
    };
  }

  /**
   * Check 4: Measurable Criteria
   * Intent should have quantifiable success conditions
   */
  private checkMeasurableCriteria(description: string): HeuristicScore {
    const lowerDesc = description.toLowerCase();

    let measurableCount = 0;
    for (const indicator of MEASURABLE_INDICATORS) {
      if (lowerDesc.includes(indicator)) {
        measurableCount++;
      }
    }

    // Check for numbers that indicate measurements
    const hasNumbers = /\d+/.test(description);
    if (hasNumbers) {
      measurableCount++;
    }

    // Check for vague qualifiers (negative)
    let vagueCount = 0;
    for (const vague of VAGUE_QUALIFIERS) {
      if (new RegExp(`\\b${vague}\\b`, 'i').test(description)) {
        vagueCount++;
      }
    }

    const netScore = measurableCount - vagueCount;
    const passed = netScore > 0 || (measurableCount > 0 && vagueCount === 0);
    const score = Math.max(0, Math.min(20, 10 + netScore * 5));

    let feedback = 'Intent has measurable success criteria';
    if (!passed) {
      if (vagueCount > 0) {
        feedback = `Contains vague qualifiers without specific measurements`;
      } else {
        feedback = 'No measurable criteria found - add specific thresholds or counts';
      }
    }

    return {
      passed,
      score,
      maxScore: 20,
      feedback,
    };
  }

  /**
   * Check 5: Reasonable Scope
   * Intent should not be too broad or too narrow
   */
  private checkReasonableScope(description: string): HeuristicScore {
    const lowerDesc = description.toLowerCase();
    const wordCount = description.split(/\s+/).length;

    let tooBroad = false;
    let tooNarrow = false;

    // Check for overly broad language
    for (const indicator of TOO_BROAD_INDICATORS) {
      if (lowerDesc.includes(indicator)) {
        tooBroad = true;
        break;
      }
    }

    // Check for overly narrow/trivial scope
    for (const indicator of TOO_NARROW_INDICATORS) {
      if (lowerDesc.includes(indicator)) {
        tooNarrow = true;
        break;
      }
    }

    // Word count heuristic: too short or too long
    if (wordCount < 5) {
      tooNarrow = true;
    } else if (wordCount > 50) {
      tooBroad = true;
    }

    const passed = !tooBroad && !tooNarrow;
    let score = 20;
    let feedback = 'Intent has reasonable scope';

    if (tooBroad) {
      score = 5;
      feedback = 'Scope is too broad - consider narrowing to a specific behavior';
    } else if (tooNarrow) {
      score = 5;
      feedback = 'Scope is too narrow - may be too trivial for an atomic intent';
    }

    return {
      passed,
      score,
      maxScore: 20,
      feedback,
    };
  }

  /**
   * Perform deep LLM analysis for atomicity
   */
  private async performLLMAnalysis(description: string): Promise<LLMAtomicityAnalysis> {
    if (!this.llmService) {
      throw new Error('LLM service not available');
    }

    const systemPrompt = `You are an expert at analyzing software requirements for atomicity.
Evaluate the intent on three dimensions:
1. Behavioral Completeness (0-1): Does it describe a complete, self-contained behavior?
2. Testability Assessment (0-1): Can this be tested with a single test case?
3. Ambiguity Score (0-1): How ambiguous is the language? (0=clear, 1=very ambiguous)

Respond in JSON format only.`;

    const userPrompt = `Analyze this intent for atomicity:
"${description}"

Respond with JSON:
{
  "behavioralCompleteness": 0.0-1.0,
  "testabilityAssessment": 0.0-1.0,
  "ambiguityScore": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

    const response = await this.llmService.invoke({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      agentName: 'atomicity-checker',
      purpose: 'Deep atomicity analysis',
      temperature: 0.2,
    });

    const parsed = parseJsonWithRecovery(response.content);
    if (!parsed || Array.isArray(parsed)) {
      throw new Error('No JSON in LLM response');
    }

    return parsed as unknown as LLMAtomicityAnalysis;
  }

  /**
   * Format heuristic name for display
   */
  private formatHeuristicName(name: string): string {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
  }
}
