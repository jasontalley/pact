import { Test, TestingModule } from '@nestjs/testing';
import {
  ValidatorTranslationService,
  TranslationResult,
  TranslationValidation,
  RoundTripResult,
} from './validator-translation.service';
import { LLMService, LLMResponse } from '../../common/llm/llm.service';
import { ValidatorFormat } from './validator.entity';

/**
 * @atom IA-PHASE2-009 Validator format translation with AI
 */
describe('ValidatorTranslationService', () => {
  let service: ValidatorTranslationService;
  let llmService: jest.Mocked<LLMService>;

  const mockLLMService = {
    invoke: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidatorTranslationService,
        {
          provide: LLMService,
          useValue: mockLLMService,
        },
      ],
    }).compile();

    service = module.get<ValidatorTranslationService>(ValidatorTranslationService);
    llmService = module.get(LLMService);
  });

  describe('translate', () => {
    const gherkinContent = `Given a user with role admin
When they access /api/users
Then access is granted`;

    const naturalLanguageContent =
      'The system should allow users with admin role to access the /api/users endpoint.';

    // @atom IA-PHASE2-009
    it('should return same content when source and target formats are identical', async () => {
      const result = await service.translate(gherkinContent, 'gherkin', 'gherkin');

      expect(result.content).toBe(gherkinContent);
      expect(result.confidence).toBe(1.0);
      expect(result.wasLLMUsed).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    // @atom IA-PHASE2-009
    it('should use LLM for translation when available', async () => {
      const translatedContent = 'Users with admin privileges can access /api/users successfully.';
      mockLLMService.invoke.mockResolvedValue({
        content: `---TRANSLATION---
${translatedContent}
---CONFIDENCE---
0.95
---WARNINGS---
---END---`,
      } as LLMResponse);

      const result = await service.translate(gherkinContent, 'gherkin', 'natural_language');

      expect(llmService.invoke).toHaveBeenCalled();
      expect(result.content).toBe(translatedContent);
      expect(result.confidence).toBe(0.95);
      expect(result.wasLLMUsed).toBe(true);
    });

    // @atom IA-PHASE2-009
    it('should fall back to heuristics when LLM fails', async () => {
      mockLLMService.invoke.mockRejectedValue(new Error('LLM unavailable'));

      const result = await service.translate(gherkinContent, 'gherkin', 'natural_language');

      expect(result.wasLLMUsed).toBe(false);
      expect(result.warnings).toContain(
        'Using heuristic translation (LLM unavailable). Quality may be reduced.',
      );
      // Should still produce a translation
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    // @atom IA-PHASE2-009
    it('should handle LLM response with warnings', async () => {
      mockLLMService.invoke.mockResolvedValue({
        content: `---TRANSLATION---
Some translated content
---CONFIDENCE---
0.75
---WARNINGS---
Some nuance may be lost
Consider reviewing manually
---END---`,
      } as LLMResponse);

      const result = await service.translate(gherkinContent, 'gherkin', 'typescript');

      expect(result.warnings).toContain('Some nuance may be lost');
      expect(result.warnings).toContain('Consider reviewing manually');
    });
  });

  describe('translateToGherkin', () => {
    // @atom IA-PHASE2-009
    it('should translate natural language to Gherkin', async () => {
      mockLLMService.invoke.mockRejectedValue(new Error('LLM unavailable'));

      const result = await service.translateToGherkin(
        'If a user is authenticated, they should see their dashboard',
        'natural_language',
      );

      expect(result.targetFormat).toBe('gherkin');
      expect(result.content).toContain('Given');
    });
  });

  describe('translateToNaturalLanguage', () => {
    // @atom IA-PHASE2-009
    it('should translate Gherkin to natural language', async () => {
      mockLLMService.invoke.mockRejectedValue(new Error('LLM unavailable'));

      const gherkin = `Given a logged in user
When they click logout
Then they are redirected to login page`;

      const result = await service.translateToNaturalLanguage(gherkin, 'gherkin');

      expect(result.targetFormat).toBe('natural_language');
      expect(result.content.toLowerCase()).toContain('user');
    });
  });

  describe('translateToTypescript', () => {
    // @atom IA-PHASE2-009
    it('should translate Gherkin to TypeScript test', async () => {
      mockLLMService.invoke.mockRejectedValue(new Error('LLM unavailable'));

      const gherkin = `Given a user exists
When they request their profile
Then their data is returned`;

      const result = await service.translateToTypescript(gherkin, 'gherkin');

      expect(result.targetFormat).toBe('typescript');
      expect(result.content).toContain('describe');
      expect(result.content).toContain('expect');
    });
  });

  describe('translateToJson', () => {
    // @atom IA-PHASE2-009
    it('should translate Gherkin to JSON format', async () => {
      mockLLMService.invoke.mockRejectedValue(new Error('LLM unavailable'));

      const gherkin = `Given precondition one
When action happens
Then outcome is verified`;

      const result = await service.translateToJson(gherkin, 'gherkin');

      expect(result.targetFormat).toBe('json');
      const parsed = JSON.parse(result.content);
      expect(parsed.given).toContain('precondition one');
      expect(parsed.when).toContain('action happens');
      expect(parsed.then).toContain('outcome is verified');
    });
  });

  describe('validateTranslation', () => {
    // @atom IA-PHASE2-009
    it('should validate translation with LLM when available', async () => {
      mockLLMService.invoke.mockResolvedValue({
        content: JSON.stringify({
          semanticEquivalence: 0.92,
          isEquivalent: true,
          differences: [],
          suggestions: [],
        }),
      } as LLMResponse);

      const result = await service.validateTranslation(
        'Given a user',
        'A user exists',
        'gherkin',
        'natural_language',
      );

      expect(result.isValid).toBe(true);
      expect(result.semanticEquivalence).toBe(0.92);
    });

    // @atom IA-PHASE2-009
    it('should fall back to heuristic validation when LLM fails', async () => {
      mockLLMService.invoke.mockRejectedValue(new Error('LLM unavailable'));

      const result = await service.validateTranslation(
        'Given a user with admin role',
        'A user who has admin privileges',
        'gherkin',
        'natural_language',
      );

      expect(result.semanticEquivalence).toBeGreaterThan(0);
      expect(result.semanticEquivalence).toBeLessThanOrEqual(1);
    });

    // @atom IA-PHASE2-009
    it('should detect potential meaning loss', async () => {
      mockLLMService.invoke.mockRejectedValue(new Error('LLM unavailable'));

      const result = await service.validateTranslation(
        'Given a user with admin role and special permissions',
        'A user exists',
        'gherkin',
        'natural_language',
      );

      // Should have warnings about missing terms
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('testRoundTrip', () => {
    // @atom IA-PHASE2-009
    it('should perform round-trip translation and calculate preservation score', async () => {
      // Mock LLM to return predictable translations
      mockLLMService.invoke
        .mockResolvedValueOnce({
          content: `---TRANSLATION---
The system validates that users with admin role can access resources.
---CONFIDENCE---
0.9
---WARNINGS---
---END---`,
        } as LLMResponse)
        .mockResolvedValueOnce({
          content: `---TRANSLATION---
Given a user with admin role
When they access resources
Then access is allowed
---CONFIDENCE---
0.85
---WARNINGS---
---END---`,
        } as LLMResponse);

      const original = `Given a user with admin role
When they access resources
Then access is granted`;

      const result = await service.testRoundTrip(original, 'gherkin', 'natural_language');

      expect(result.originalContent).toBe(original);
      expect(result.translatedContent).toBeDefined();
      expect(result.roundTripContent).toBeDefined();
      expect(result.preservationScore).toBeGreaterThanOrEqual(0);
      expect(result.preservationScore).toBeLessThanOrEqual(1);
    });

    // @atom IA-PHASE2-009
    it('should mark round-trip as acceptable when preservation is high', async () => {
      // Same content returned = perfect preservation
      mockLLMService.invoke.mockResolvedValue({
        content: `---TRANSLATION---
Given a test
---CONFIDENCE---
1.0
---WARNINGS---
---END---`,
      } as LLMResponse);

      const result = await service.testRoundTrip('Given a test', 'gherkin', 'gherkin');

      expect(result.preservationScore).toBe(1.0);
      expect(result.isAcceptable).toBe(true);
    });
  });

  describe('heuristic translations', () => {
    beforeEach(() => {
      // Force heuristic mode by making LLM fail
      mockLLMService.invoke.mockRejectedValue(new Error('LLM unavailable'));
    });

    // @atom IA-PHASE2-009
    it('should convert Gherkin to natural language heuristically', async () => {
      const gherkin = `Given a user is logged in
When they click the button
Then the action completes`;

      const result = await service.translate(gherkin, 'gherkin', 'natural_language');

      expect(result.content.toLowerCase()).toContain('user');
      expect(result.content.toLowerCase()).toContain('logged');
      expect(result.wasLLMUsed).toBe(false);
    });

    // @atom IA-PHASE2-009
    it('should convert natural language to Gherkin heuristically', async () => {
      const natural = 'If a user is authenticated, they should be able to view their profile.';

      const result = await service.translate(natural, 'natural_language', 'gherkin');

      expect(result.content).toContain('Given');
      expect(result.content).toContain('When');
      expect(result.content).toContain('Then');
      expect(result.wasLLMUsed).toBe(false);
    });

    // @atom IA-PHASE2-009
    it('should convert Gherkin to TypeScript heuristically', async () => {
      const gherkin = `Given setup
When action
Then assertion`;

      const result = await service.translate(gherkin, 'gherkin', 'typescript');

      expect(result.content).toContain('describe');
      expect(result.content).toContain('it');
      expect(result.content).toContain('expect');
    });

    // @atom IA-PHASE2-009
    it('should convert any format to JSON', async () => {
      const gherkin = `Given a precondition
When an action occurs
Then the result is verified`;

      const result = await service.translate(gherkin, 'gherkin', 'json');

      expect(() => JSON.parse(result.content)).not.toThrow();
      const parsed = JSON.parse(result.content);
      expect(parsed).toHaveProperty('given');
      expect(parsed).toHaveProperty('when');
      expect(parsed).toHaveProperty('then');
    });

    // @atom IA-PHASE2-009
    it('should convert JSON back to Gherkin', async () => {
      const json = JSON.stringify({
        given: ['a user exists'],
        when: ['they log in'],
        then: ['they see dashboard'],
      });

      const result = await service.translate(json, 'json', 'gherkin');

      expect(result.content).toContain('Given a user exists');
      expect(result.content).toContain('When they log in');
      expect(result.content).toContain('Then they see dashboard');
    });
  });

  describe('service without LLM', () => {
    let serviceWithoutLLM: ValidatorTranslationService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [ValidatorTranslationService],
      }).compile();

      serviceWithoutLLM = module.get<ValidatorTranslationService>(ValidatorTranslationService);
    });

    // @atom IA-PHASE2-009
    it('should work without LLM service using only heuristics', async () => {
      const result = await serviceWithoutLLM.translate(
        'Given a test\nWhen run\nThen pass',
        'gherkin',
        'natural_language',
      );

      expect(result.wasLLMUsed).toBe(false);
      expect(result.content).toBeDefined();
      expect(result.warnings).toContain(
        'Using heuristic translation (LLM unavailable). Quality may be reduced.',
      );
    });

    // @atom IA-PHASE2-009
    it('should validate translations heuristically without LLM', async () => {
      const result = await serviceWithoutLLM.validateTranslation(
        'Given user with admin',
        'Admin user exists',
        'gherkin',
        'natural_language',
      );

      expect(result.semanticEquivalence).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      mockLLMService.invoke.mockRejectedValue(new Error('LLM unavailable'));
    });

    // @atom IA-PHASE2-009
    it('should handle empty content', async () => {
      const result = await service.translate('', 'gherkin', 'natural_language');

      expect(result.content).toBeDefined();
    });

    // @atom IA-PHASE2-009
    it('should handle very long content', async () => {
      const longContent = 'Given a user\n'.repeat(100);

      const result = await service.translate(longContent, 'gherkin', 'natural_language');

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    // @atom IA-PHASE2-009
    it('should handle special characters', async () => {
      const contentWithSpecialChars = `Given a user with email test@example.com
When they access /api/v1/users?filter=active&limit=10
Then they see <html> content`;

      const result = await service.translate(
        contentWithSpecialChars,
        'gherkin',
        'natural_language',
      );

      expect(result.content).toBeDefined();
    });

    // @atom IA-PHASE2-009
    it('should handle malformed LLM response gracefully', async () => {
      mockLLMService.invoke.mockResolvedValue({
        content: 'Just some plain text without the expected format',
      } as LLMResponse);

      const result = await service.translate('Given a test', 'gherkin', 'natural_language');

      // Should use the entire response as translation
      expect(result.content).toBe('Just some plain text without the expected format');
      expect(result.warnings).toContain(
        'Response format was non-standard, using entire response as translation.',
      );
    });

    // @atom IA-PHASE2-009
    it('should handle invalid JSON in validation response', async () => {
      mockLLMService.invoke.mockResolvedValue({
        content: 'Not valid JSON at all',
      } as LLMResponse);

      const result = await service.validateTranslation(
        'Given a user',
        'A user exists',
        'gherkin',
        'natural_language',
      );

      // Should fall back to heuristic validation
      expect(result.semanticEquivalence).toBeGreaterThanOrEqual(0);
      expect(result.semanticEquivalence).toBeLessThanOrEqual(1);
    });
  });
});
