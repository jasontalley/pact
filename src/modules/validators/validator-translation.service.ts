import { Injectable, Logger, Optional } from '@nestjs/common';
import { LLMService } from '../../common/llm/llm.service';
import { ValidatorFormat } from './validator.entity';

/**
 * Translation result with confidence score
 */
export interface TranslationResult {
  content: string;
  sourceFormat: ValidatorFormat;
  targetFormat: ValidatorFormat;
  confidence: number;
  warnings: string[];
  wasLLMUsed: boolean;
}

/**
 * Translation validation result
 */
export interface TranslationValidation {
  isValid: boolean;
  semanticEquivalence: number;
  warnings: string[];
  suggestions: string[];
}

/**
 * Round-trip translation test result
 */
export interface RoundTripResult {
  originalContent: string;
  translatedContent: string;
  roundTripContent: string;
  preservationScore: number;
  isAcceptable: boolean;
  differences: string[];
}

/**
 * ValidatorTranslationService
 *
 * Provides AI-powered translation between validator formats:
 * - natural_language: Human-readable descriptions
 * - gherkin: Given/When/Then behavior specifications
 * - typescript: Executable test code
 * - json: Structured JSON assertions
 *
 * Features:
 * - LLM-powered translation with heuristic fallbacks
 * - Translation validation and confidence scoring
 * - Round-trip translation verification
 * - Caching support via ValidatorsService
 *
 * @atom IA-PHASE2-009 Validator format translation with AI
 */
@Injectable()
export class ValidatorTranslationService {
  private readonly logger = new Logger(ValidatorTranslationService.name);

  constructor(@Optional() private readonly llmService?: LLMService) {}

  /**
   * Translate validator content from one format to another
   */
  async translate(
    content: string,
    sourceFormat: ValidatorFormat,
    targetFormat: ValidatorFormat,
  ): Promise<TranslationResult> {
    this.logger.log(`Translating from ${sourceFormat} to ${targetFormat}`);

    // If same format, return as-is
    if (sourceFormat === targetFormat) {
      return {
        content,
        sourceFormat,
        targetFormat,
        confidence: 1.0,
        warnings: [],
        wasLLMUsed: false,
      };
    }

    // Try LLM translation first
    if (this.llmService) {
      try {
        return await this.translateWithLLM(content, sourceFormat, targetFormat);
      } catch (error) {
        this.logger.warn(`LLM translation failed, falling back to heuristics: ${error.message}`);
      }
    }

    // Fall back to heuristic translation
    return this.translateWithHeuristics(content, sourceFormat, targetFormat);
  }

  /**
   * Translate to Gherkin format
   */
  async translateToGherkin(
    content: string,
    sourceFormat: ValidatorFormat,
  ): Promise<TranslationResult> {
    return this.translate(content, sourceFormat, 'gherkin');
  }

  /**
   * Translate to natural language format
   */
  async translateToNaturalLanguage(
    content: string,
    sourceFormat: ValidatorFormat,
  ): Promise<TranslationResult> {
    return this.translate(content, sourceFormat, 'natural_language');
  }

  /**
   * Translate to executable TypeScript format
   */
  async translateToTypescript(
    content: string,
    sourceFormat: ValidatorFormat,
  ): Promise<TranslationResult> {
    return this.translate(content, sourceFormat, 'typescript');
  }

  /**
   * Translate to JSON format
   */
  async translateToJson(
    content: string,
    sourceFormat: ValidatorFormat,
  ): Promise<TranslationResult> {
    return this.translate(content, sourceFormat, 'json');
  }

  /**
   * Validate that a translation preserves semantic meaning
   */
  async validateTranslation(
    original: string,
    translated: string,
    sourceFormat: ValidatorFormat,
    targetFormat: ValidatorFormat,
  ): Promise<TranslationValidation> {
    this.logger.log(`Validating translation from ${sourceFormat} to ${targetFormat}`);

    // Use LLM for semantic validation if available
    if (this.llmService) {
      try {
        return await this.validateWithLLM(original, translated, sourceFormat, targetFormat);
      } catch (error) {
        this.logger.warn(`LLM validation failed, using heuristic validation: ${error.message}`);
      }
    }

    // Fall back to heuristic validation
    return this.validateWithHeuristics(original, translated, sourceFormat, targetFormat);
  }

  /**
   * Perform round-trip translation test (A → B → A)
   */
  async testRoundTrip(
    content: string,
    sourceFormat: ValidatorFormat,
    targetFormat: ValidatorFormat,
  ): Promise<RoundTripResult> {
    this.logger.log(
      `Testing round-trip translation: ${sourceFormat} → ${targetFormat} → ${sourceFormat}`,
    );

    // Translate to target format
    const toTarget = await this.translate(content, sourceFormat, targetFormat);

    // Translate back to source format
    const backToSource = await this.translate(toTarget.content, targetFormat, sourceFormat);

    // Calculate preservation score
    const preservationScore = this.calculatePreservationScore(content, backToSource.content);

    // Find differences
    const differences = this.findDifferences(content, backToSource.content);

    return {
      originalContent: content,
      translatedContent: toTarget.content,
      roundTripContent: backToSource.content,
      preservationScore,
      isAcceptable: preservationScore >= 0.9,
      differences,
    };
  }

  /**
   * Translate using LLM
   */
  private async translateWithLLM(
    content: string,
    sourceFormat: ValidatorFormat,
    targetFormat: ValidatorFormat,
  ): Promise<TranslationResult> {
    const prompt = this.buildTranslationPrompt(content, sourceFormat, targetFormat);

    const response = await this.llmService!.invoke({
      messages: [
        {
          role: 'system',
          content: this.getTranslationSystemPrompt(),
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      agentName: 'validator-translation',
      purpose: `Translate validator from ${sourceFormat} to ${targetFormat}`,
      temperature: 0.3, // Lower temperature for more consistent translations
      maxTokens: 2000,
    });

    // Parse the response
    const { translatedContent, confidence, warnings } = this.parseTranslationResponse(
      response.content,
      targetFormat,
    );

    return {
      content: translatedContent,
      sourceFormat,
      targetFormat,
      confidence,
      warnings,
      wasLLMUsed: true,
    };
  }

  /**
   * Translate using heuristic rules
   */
  private translateWithHeuristics(
    content: string,
    sourceFormat: ValidatorFormat,
    targetFormat: ValidatorFormat,
  ): TranslationResult {
    let translatedContent: string;
    let confidence: number;
    const warnings: string[] = [];

    warnings.push('Using heuristic translation (LLM unavailable). Quality may be reduced.');

    switch (`${sourceFormat}_to_${targetFormat}`) {
      case 'gherkin_to_natural_language':
        translatedContent = this.gherkinToNaturalLanguage(content);
        confidence = 0.8;
        break;

      case 'natural_language_to_gherkin':
        translatedContent = this.naturalLanguageToGherkin(content);
        confidence = 0.6;
        warnings.push('Natural language to Gherkin conversion may not capture all nuances.');
        break;

      case 'gherkin_to_typescript':
        translatedContent = this.gherkinToTypescript(content);
        confidence = 0.7;
        break;

      case 'typescript_to_gherkin':
        translatedContent = this.typescriptToGherkin(content);
        confidence = 0.5;
        warnings.push('TypeScript to Gherkin conversion is approximate.');
        break;

      case 'natural_language_to_typescript':
        translatedContent = this.naturalLanguageToTypescript(content);
        confidence = 0.5;
        warnings.push('Natural language to TypeScript conversion is approximate.');
        break;

      case 'typescript_to_natural_language':
        translatedContent = this.typescriptToNaturalLanguage(content);
        confidence = 0.6;
        break;

      case 'gherkin_to_json':
      case 'natural_language_to_json':
      case 'typescript_to_json':
        translatedContent = this.toJson(content, sourceFormat);
        confidence = 0.7;
        break;

      case 'json_to_gherkin':
      case 'json_to_natural_language':
      case 'json_to_typescript':
        translatedContent = this.fromJson(content, targetFormat);
        confidence = 0.7;
        break;

      default:
        translatedContent = content;
        confidence = 0.3;
        warnings.push(`Direct translation from ${sourceFormat} to ${targetFormat} not supported.`);
    }

    return {
      content: translatedContent,
      sourceFormat,
      targetFormat,
      confidence,
      warnings,
      wasLLMUsed: false,
    };
  }

  /**
   * Validate translation using LLM
   */
  private async validateWithLLM(
    original: string,
    translated: string,
    sourceFormat: ValidatorFormat,
    targetFormat: ValidatorFormat,
  ): Promise<TranslationValidation> {
    const prompt = `Compare these two validator specifications and determine if they have the same semantic meaning.

Original (${sourceFormat}):
${original}

Translated (${targetFormat}):
${translated}

Analyze:
1. Do they test the same behavior?
2. Are there any semantic differences?
3. Are there any missing or added requirements?

Respond with JSON:
{
  "semanticEquivalence": 0.0-1.0,
  "isEquivalent": true/false,
  "differences": ["difference 1", ...],
  "suggestions": ["suggestion 1", ...]
}`;

    const response = await this.llmService!.invoke({
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at analyzing software requirements and test specifications. Respond only with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      agentName: 'validator-translation-validation',
      purpose: 'Validate translation semantic equivalence',
      temperature: 0.2,
      maxTokens: 1000,
    });

    try {
      const result = JSON.parse(response.content);
      return {
        isValid: result.isEquivalent,
        semanticEquivalence: result.semanticEquivalence,
        warnings: result.differences || [],
        suggestions: result.suggestions || [],
      };
    } catch {
      // If JSON parsing fails, do basic validation
      return this.validateWithHeuristics(original, translated, sourceFormat, targetFormat);
    }
  }

  /**
   * Validate translation using heuristics
   */
  private validateWithHeuristics(
    original: string,
    translated: string,
    sourceFormat: ValidatorFormat,
    targetFormat: ValidatorFormat,
  ): TranslationValidation {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Basic length check
    const lengthRatio = translated.length / original.length;
    if (lengthRatio < 0.3 || lengthRatio > 3.0) {
      warnings.push('Translation length significantly differs from original.');
    }

    // Check for key terms preservation
    const keyTerms = this.extractKeyTerms(original);
    const translatedLower = translated.toLowerCase();
    const missingTerms = keyTerms.filter((term) => !translatedLower.includes(term.toLowerCase()));

    if (missingTerms.length > 0) {
      warnings.push(`Some key terms may not be preserved: ${missingTerms.join(', ')}`);
    }

    // Calculate basic equivalence score
    const preservedTerms = keyTerms.length - missingTerms.length;
    const semanticEquivalence = keyTerms.length > 0 ? preservedTerms / keyTerms.length : 0.5;

    // Add suggestions
    if (missingTerms.length > 0) {
      suggestions.push('Review translation to ensure all requirements are captured.');
    }

    if (targetFormat === 'gherkin' && !translated.includes('Given')) {
      suggestions.push('Gherkin format should include Given/When/Then structure.');
    }

    return {
      isValid: semanticEquivalence >= 0.7 && warnings.length === 0,
      semanticEquivalence,
      warnings,
      suggestions,
    };
  }

  /**
   * Build translation prompt for LLM
   */
  private buildTranslationPrompt(
    content: string,
    sourceFormat: ValidatorFormat,
    targetFormat: ValidatorFormat,
  ): string {
    const formatDescriptions: Record<ValidatorFormat, string> = {
      gherkin: 'Gherkin format with Given/When/Then structure',
      natural_language: 'Clear, human-readable natural language description',
      typescript: 'TypeScript/Jest test code with assertions',
      json: 'Structured JSON with conditions and expectations',
    };

    return `Translate the following validator from ${formatDescriptions[sourceFormat]} to ${formatDescriptions[targetFormat]}.

Source (${sourceFormat}):
${content}

Requirements:
1. Preserve the exact semantic meaning
2. Use proper ${targetFormat} syntax and conventions
3. Be precise and unambiguous

Respond with the translation, followed by a confidence score (0.0-1.0), and any warnings.
Format:
---TRANSLATION---
[translated content]
---CONFIDENCE---
[score]
---WARNINGS---
[warning 1]
[warning 2]
---END---`;
  }

  /**
   * Get system prompt for translation
   */
  private getTranslationSystemPrompt(): string {
    return `You are an expert at translating software validation specifications between different formats.

Your translations must:
1. Preserve exact semantic meaning - the translated validator must test the same behavior
2. Use proper syntax for the target format
3. Be clear and unambiguous
4. Include all conditions and assertions from the original

Format-specific guidelines:
- Gherkin: Use proper Given/When/Then structure, be specific about preconditions and outcomes
- Natural Language: Write clear, complete sentences that describe the behavior being validated
- TypeScript: Generate runnable Jest test code with proper assertions
- JSON: Structure as { "given": [], "when": [], "then": [] } with clear conditions

Always assess your confidence in the translation accuracy and note any potential issues.`;
  }

  /**
   * Parse LLM translation response
   */
  private parseTranslationResponse(
    response: string,
    targetFormat: ValidatorFormat,
  ): { translatedContent: string; confidence: number; warnings: string[] } {
    let translatedContent = '';
    let confidence = 0.7;
    const warnings: string[] = [];

    // Try to parse structured response
    const translationMatch = response.match(/---TRANSLATION---\s*([\s\S]*?)\s*---CONFIDENCE---/);
    const confidenceMatch = response.match(/---CONFIDENCE---\s*([\d.]+)/);
    const warningsMatch = response.match(/---WARNINGS---\s*([\s\S]*?)\s*---END---/);

    if (translationMatch) {
      translatedContent = translationMatch[1].trim();
    } else {
      // Fall back to using the whole response as translation
      translatedContent = response.trim();
      warnings.push('Response format was non-standard, using entire response as translation.');
    }

    if (confidenceMatch) {
      confidence = Math.min(1.0, Math.max(0.0, parseFloat(confidenceMatch[1])));
    }

    if (warningsMatch) {
      const warningLines = warningsMatch[1]
        .trim()
        .split('\n')
        .filter((w) => w.trim());
      warnings.push(...warningLines);
    }

    // Validate the translated content for target format
    const formatWarnings = this.validateFormatSyntax(translatedContent, targetFormat);
    warnings.push(...formatWarnings);

    return { translatedContent, confidence, warnings };
  }

  /**
   * Validate that content matches expected format syntax
   */
  private validateFormatSyntax(content: string, format: ValidatorFormat): string[] {
    const warnings: string[] = [];

    switch (format) {
      case 'gherkin':
        if (!content.includes('Given') && !content.includes('When') && !content.includes('Then')) {
          warnings.push('Gherkin translation may be missing Given/When/Then keywords.');
        }
        break;

      case 'typescript':
        if (!content.includes('expect') && !content.includes('assert')) {
          warnings.push('TypeScript translation may be missing assertions.');
        }
        break;

      case 'json':
        try {
          JSON.parse(content);
        } catch {
          warnings.push('JSON translation is not valid JSON.');
        }
        break;
    }

    return warnings;
  }

  /**
   * Extract key terms from content
   */
  private extractKeyTerms(content: string): string[] {
    // Extract important terms (nouns, verbs, conditions)
    const words = content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    // Remove common stop words
    const stopWords = new Set([
      'that',
      'this',
      'with',
      'from',
      'have',
      'been',
      'will',
      'would',
      'could',
      'should',
      'when',
      'then',
      'given',
      'must',
      'shall',
      'does',
      'done',
    ]);

    return [...new Set(words.filter((w) => !stopWords.has(w)))];
  }

  /**
   * Calculate preservation score between original and round-trip content
   */
  private calculatePreservationScore(original: string, roundTrip: string): number {
    const originalTerms = new Set(this.extractKeyTerms(original));
    const roundTripTerms = new Set(this.extractKeyTerms(roundTrip));

    if (originalTerms.size === 0) return 1.0;

    const preserved = [...originalTerms].filter((t) => roundTripTerms.has(t)).length;
    return preserved / originalTerms.size;
  }

  /**
   * Find differences between original and round-trip content
   */
  private findDifferences(original: string, roundTrip: string): string[] {
    const differences: string[] = [];
    const originalTerms = new Set(this.extractKeyTerms(original));
    const roundTripTerms = new Set(this.extractKeyTerms(roundTrip));

    const lost = [...originalTerms].filter((t) => !roundTripTerms.has(t));
    const added = [...roundTripTerms].filter((t) => !originalTerms.has(t));

    if (lost.length > 0) {
      differences.push(`Lost terms: ${lost.join(', ')}`);
    }
    if (added.length > 0) {
      differences.push(`Added terms: ${added.join(', ')}`);
    }

    return differences;
  }

  // ========================================
  // Heuristic Translation Methods
  // ========================================

  private gherkinToNaturalLanguage(content: string): string {
    const lines = content.split('\n');
    const parts: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Given ')) {
        parts.push(`Starting with ${trimmed.replace('Given ', '').toLowerCase()}`);
      } else if (trimmed.startsWith('When ')) {
        parts.push(`when ${trimmed.replace('When ', '').toLowerCase()}`);
      } else if (trimmed.startsWith('Then ')) {
        parts.push(`then ${trimmed.replace('Then ', '').toLowerCase()}`);
      } else if (trimmed.startsWith('And ')) {
        parts.push(`and ${trimmed.replace('And ', '').toLowerCase()}`);
      }
    }

    return parts.length > 0 ? `The system should validate that ${parts.join(', ')}.` : content;
  }

  private naturalLanguageToGherkin(content: string): string {
    // Simple heuristic: try to identify conditions and outcomes
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim());

    if (sentences.length === 0) return content;

    const lines: string[] = ['Feature: Validator'];
    lines.push('  Scenario: Validation');

    // Try to identify preconditions
    const preconditions = sentences.filter((s) => /\b(if|when|given|assuming|with)\b/i.test(s));
    const outcomes = sentences.filter((s) => /\b(then|should|must|will|expect|verify)\b/i.test(s));

    if (preconditions.length > 0) {
      lines.push(`    Given ${preconditions[0].trim()}`);
    } else {
      lines.push(`    Given the system is in a valid state`);
    }

    lines.push(`    When the validation is executed`);

    if (outcomes.length > 0) {
      lines.push(`    Then ${outcomes[0].trim()}`);
    } else {
      lines.push(`    Then ${sentences[0].trim()}`);
    }

    return lines.join('\n');
  }

  private gherkinToTypescript(content: string): string {
    const lines = content.split('\n');
    const testLines: string[] = [];

    testLines.push("describe('Validator', () => {");
    testLines.push("  it('should pass validation', () => {");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Given ')) {
        testLines.push(`    // Setup: ${trimmed.replace('Given ', '')}`);
      } else if (trimmed.startsWith('When ')) {
        testLines.push(`    // Action: ${trimmed.replace('When ', '')}`);
      } else if (trimmed.startsWith('Then ')) {
        testLines.push(`    // Assert: ${trimmed.replace('Then ', '')}`);
        testLines.push(`    expect(true).toBe(true); // TODO: Implement assertion`);
      }
    }

    testLines.push('  });');
    testLines.push('});');

    return testLines.join('\n');
  }

  private typescriptToGherkin(content: string): string {
    // Extract comments and assertions to build Gherkin
    const comments = content.match(/\/\/\s*(.+)/g) ?? [];
    const assertions = content.match(/expect\(.+\)/g) ?? [];

    const lines: string[] = ['Feature: Extracted from TypeScript'];
    lines.push('  Scenario: Validation');

    const firstComment = comments[0];
    if (firstComment) {
      lines.push(`    Given ${firstComment.replace('//', '').trim()}`);
    } else {
      lines.push('    Given the system is configured');
    }

    lines.push('    When the validation runs');

    const firstAssertion = assertions[0];
    if (firstAssertion) {
      lines.push(`    Then the assertion ${firstAssertion} should pass`);
    } else {
      lines.push('    Then the validation should pass');
    }

    return lines.join('\n');
  }

  private naturalLanguageToTypescript(content: string): string {
    return `describe('Validator', () => {
  it('should validate: ${content.substring(0, 50)}...', () => {
    // Natural language requirement:
    // ${content}

    // TODO: Implement test based on the requirement above
    expect(true).toBe(true);
  });
});`;
  }

  private typescriptToNaturalLanguage(content: string): string {
    // Extract describe and it blocks
    const describeMatch = content.match(/describe\(['"](.+?)['"]/);
    const itMatch = content.match(/it\(['"](.+?)['"]/);

    const description = describeMatch ? describeMatch[1] : 'The system';
    const behavior = itMatch ? itMatch[1] : 'behaves correctly';

    return `${description} ${behavior}.`;
  }

  private toJson(content: string, sourceFormat: ValidatorFormat): string {
    const json: Record<string, unknown> = {
      sourceFormat,
      given: [] as string[],
      when: [] as string[],
      then: [] as string[],
      rawContent: content,
    };

    if (sourceFormat === 'gherkin') {
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('Given ')) {
          (json.given as string[]).push(trimmed.replace('Given ', ''));
        } else if (trimmed.startsWith('When ')) {
          (json.when as string[]).push(trimmed.replace('When ', ''));
        } else if (trimmed.startsWith('Then ')) {
          (json.then as string[]).push(trimmed.replace('Then ', ''));
        }
      }
    } else {
      (json.given as string[]).push('System is in initial state');
      (json.when as string[]).push('Validation is executed');
      (json.then as string[]).push(content);
    }

    return JSON.stringify(json, null, 2);
  }

  private fromJson(content: string, targetFormat: ValidatorFormat): string {
    try {
      const json = JSON.parse(content);

      if (targetFormat === 'gherkin') {
        const lines: string[] = [];
        for (const given of json.given || []) {
          lines.push(`Given ${given}`);
        }
        for (const when of json.when || []) {
          lines.push(`When ${when}`);
        }
        for (const then of json.then || []) {
          lines.push(`Then ${then}`);
        }
        return lines.join('\n');
      }

      if (targetFormat === 'natural_language') {
        const parts: string[] = [];
        if (json.given?.length) parts.push(`Given ${json.given.join(' and ')}`);
        if (json.when?.length) parts.push(`when ${json.when.join(' and ')}`);
        if (json.then?.length) parts.push(`then ${json.then.join(' and ')}`);
        return parts.join(', ') + '.';
      }

      return json.rawContent || content;
    } catch {
      return content;
    }
  }
}
