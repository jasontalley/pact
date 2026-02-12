import { Injectable } from '@nestjs/common';
import { LLMService } from '../../common/llm/llm.service';
import { parseJsonWithRecovery } from '../../common/llm/json-recovery';

/**
 * Inferred atom structure from orphan test analysis
 */
export interface InferredAtom {
  description: string;
  category: 'functional' | 'security' | 'performance' | 'ux' | 'operational';
  validators: string[];
  rationale: string;
  confidence: number; // 0.0-1.0
  evidence: string[]; // What test behavior suggests this atom
}

/**
 * Service for inferring intent atoms from orphan tests
 *
 * When reconciliation detects tests without @atom annotations,
 * this service uses LLM analysis to infer the intent atom
 * that the test validates.
 *
 * Phase 18: Enables automatic atom suggestion for orphan tests
 */
@Injectable()
export class AtomInferenceService {
  constructor(private readonly llmService: LLMService) {}

  /**
   * Infer an intent atom from an orphan test
   *
   * Analyzes test code to extract:
   * - Clear, testable description of intended behavior
   * - Category (functional, security, performance, ux, operational)
   * - Observable outcomes (validators)
   * - Confidence score
   *
   * @param testFile - Path to test file
   * @param testName - Name of the test
   * @param testCode - Full test code
   * @returns Inferred atom structure
   */
  async inferAtomFromTest(
    testFile: string,
    testName: string,
    testCode: string,
  ): Promise<InferredAtom> {
    const prompt = this.buildInferencePrompt(testFile, testName, testCode);

    const response = await this.llmService.invoke({
      messages: [{ role: 'user', content: prompt }],
      preferredModel: 'claude-sonnet-4-5',
      temperature: 0.3, // Lower temperature for more consistent inference
      agentName: 'atom-inference',
      maxTokens: 2000,
    });

    const content = response.content;

    // Parse JSON response with error handling
    try {
      const parsed = this.parseInferenceResponse(content);
      return this.validateAndNormalize(parsed, testFile, testName, testCode);
    } catch (error) {
      // Fallback: create low-confidence atom with basic info
      return this.createFallbackAtom(testFile, testName, testCode);
    }
  }

  /**
   * Build LLM prompt for atom inference
   */
  private buildInferencePrompt(testFile: string, testName: string, testCode: string): string {
    return `You are an expert at analyzing test code and inferring the underlying intent atom being validated.

Given this orphan test (no @atom annotation):

**Test file**: ${testFile}
**Test name**: ${testName}
**Test code**:
\`\`\`typescript
${testCode}
\`\`\`

Analyze this test and infer the intent atom it validates. Provide your response as a JSON object with this structure:

{
  "description": "Clear, testable description of the intended behavior (imperative form, 10-100 words)",
  "category": "functional" | "security" | "performance" | "ux" | "operational",
  "validators": ["Observable outcome 1", "Observable outcome 2", ...],
  "rationale": "Why this atom is needed and what evidence from the test supports it (2-3 sentences)",
  "confidence": 0.0-1.0,
  "evidence": ["Test assertion 1", "Test setup detail 1", ...]
}

**Guidelines**:
1. **Description**: Extract the core behavioral intent, not implementation details
   - Good: "User can reset password via email with a secure token"
   - Bad: "POST /auth/reset-password endpoint returns 200 status"

2. **Category inference**:
   - functional: Business logic, user actions, data operations
   - security: Authentication, authorization, encryption, validation
   - performance: Response time, throughput, resource usage
   - ux: User experience, accessibility, interface behavior
   - operational: Logging, monitoring, error handling, resilience

3. **Validators**: Extract from test assertions (what's being verified)
   - Look for expect() calls, assertion methods, mock verifications
   - Describe observable outcomes, not code paths

4. **Confidence scoring**:
   - 0.9-1.0: Test name and assertions clearly indicate intent
   - 0.7-0.9: Intent can be inferred with reasonable certainty
   - 0.5-0.7: Some ambiguity, multiple interpretations possible
   - 0.3-0.5: Highly ambiguous, technical test
   - 0.0-0.3: Cannot reliably infer intent (integration/setup test)

5. **Evidence**: Quote specific test code that supports your inference
   - Assertions: "expect(response.status).toBe(200)"
   - Setup: "mockEmailService.send.mockResolvedValue(true)"
   - Test description: "test('should send email')"

Respond with ONLY the JSON object, no additional commentary.`;
  }

  /**
   * Parse LLM response into InferredAtom structure
   */
  private parseInferenceResponse(content: string): InferredAtom {
    const raw = parseJsonWithRecovery(content);
    if (!raw || Array.isArray(raw)) {
      throw new Error('Failed to parse LLM response');
    }
    const parsed = raw;

    return {
      description: parsed.description as string,
      category: parsed.category as InferredAtom['category'],
      validators: Array.isArray(parsed.validators) ? parsed.validators : [],
      rationale: parsed.rationale as string,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
    };
  }

  /**
   * Validate and normalize inferred atom data
   */
  private validateAndNormalize(
    atom: InferredAtom,
    testFile: string,
    testName: string,
    testCode: string,
  ): InferredAtom {
    // Validate category
    const validCategories = ['functional', 'security', 'performance', 'ux', 'operational'];
    if (!validCategories.includes(atom.category)) {
      atom.category = 'functional'; // Default fallback
      atom.confidence = Math.max(0, atom.confidence - 0.2); // Reduce confidence
    }

    // Ensure confidence is in range
    atom.confidence = Math.max(0, Math.min(1, atom.confidence));

    // Ensure description is not too short
    if (atom.description.length < 10) {
      atom.description = this.extractDescriptionFromTestName(testName);
      atom.confidence = Math.max(0, atom.confidence - 0.3);
    }

    // Ensure we have at least one validator
    if (atom.validators.length === 0) {
      atom.validators = [this.extractBasicValidator(testCode)];
      atom.confidence = Math.max(0, atom.confidence - 0.1);
    }

    return atom;
  }

  /**
   * Create fallback atom when inference fails
   */
  private createFallbackAtom(testFile: string, testName: string, testCode: string): InferredAtom {
    return {
      description: this.extractDescriptionFromTestName(testName),
      category: 'functional',
      validators: [this.extractBasicValidator(testCode)],
      rationale: `Inferred from orphan test: ${testName}. Manual review recommended.`,
      confidence: 0.3, // Low confidence for fallback
      evidence: [`Test name: ${testName}`],
    };
  }

  /**
   * Extract a basic description from test name
   */
  private extractDescriptionFromTestName(testName: string): string {
    // Convert test name to sentence case
    // Example: "should_send_email_notification" -> "Should send email notification"
    let description = testName
      .replace(/^(it|test|should)\s+/i, '')
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();

    // Capitalize first letter
    description = description.charAt(0).toUpperCase() + description.slice(1);

    return description;
  }

  /**
   * Extract a basic validator from test code
   */
  private extractBasicValidator(testCode: string): string {
    // Look for expect() calls
    const expectMatch = testCode.match(/expect\((.*?)\)\.(.*?)\(/);
    if (expectMatch) {
      return `Validates: ${expectMatch[1].trim()}`;
    }

    // Look for assertions
    const assertMatch = testCode.match(/assert\.(.*?)\(/);
    if (assertMatch) {
      return `Assertion: ${assertMatch[1]}`;
    }

    return 'Test validates expected behavior';
  }
}
