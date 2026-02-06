import { Test, TestingModule } from '@nestjs/testing';
import { AtomInferenceService, InferredAtom } from './atom-inference.service';
import { LLMService } from '../../common/llm/llm.service';

describe('AtomInferenceService', () => {
  let service: AtomInferenceService;
  let llmService: jest.Mocked<LLMService>;

  beforeEach(async () => {
    const mockLLMService = {
      invoke: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtomInferenceService,
        {
          provide: LLMService,
          useValue: mockLLMService,
        },
      ],
    }).compile();

    service = module.get<AtomInferenceService>(AtomInferenceService);
    llmService = module.get(LLMService) as jest.Mocked<LLMService>;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('inferAtomFromTest', () => {
    const testFile = 'src/auth/auth.service.spec.ts';
    const testName = 'should send password reset email';
    const testCode = `
      it('should send password reset email', async () => {
        const email = 'user@example.com';
        await service.requestPasswordReset(email);
        expect(mockEmailService.send).toHaveBeenCalledWith(
          email,
          expect.objectContaining({ subject: 'Password Reset' })
        );
      });
    `;

    it('should infer atom with high confidence from clear test', async () => {
      const mockResponse = {
        content: JSON.stringify({
          description: 'User can request password reset via email',
          category: 'functional',
          validators: ['Email is sent to user', 'Email contains password reset link'],
          rationale:
            'Test validates email sending behavior for password reset flow. ' +
            'Evidence: mockEmailService.send is called with correct parameters.',
          confidence: 0.9,
          evidence: [
            'expect(mockEmailService.send).toHaveBeenCalledWith(email, ...)',
            "Test name: 'should send password reset email'",
          ],
        }),
      };

      llmService.invoke.mockResolvedValue(mockResponse);

      const result = await service.inferAtomFromTest(testFile, testName, testCode);

      expect(result).toEqual({
        description: 'User can request password reset via email',
        category: 'functional',
        validators: expect.arrayContaining([
          'Email is sent to user',
          'Email contains password reset link',
        ]),
        rationale: expect.stringContaining('password reset flow'),
        confidence: 0.9,
        evidence: expect.arrayContaining([expect.stringContaining('mockEmailService.send')]),
      });

      expect(llmService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredModel: 'claude-sonnet-4-5',
          temperature: 0.3,
          agentName: 'atom-inference',
        }),
      );
    });

    it('should classify security tests correctly', async () => {
      const securityTestCode = `
        it('should reject invalid JWT tokens', async () => {
          const invalidToken = 'invalid.token.here';
          await expect(service.validateToken(invalidToken)).rejects.toThrow('Unauthorized');
        });
      `;

      const mockResponse = {
        content: JSON.stringify({
          description: 'System rejects invalid authentication tokens',
          category: 'security',
          validators: ['Invalid tokens are rejected', 'Unauthorized error is thrown'],
          rationale: 'Test validates security behavior for token validation',
          confidence: 0.85,
          evidence: ["expect(...).rejects.toThrow('Unauthorized')"],
        }),
      };

      llmService.invoke.mockResolvedValue(mockResponse);

      const result = await service.inferAtomFromTest(
        testFile,
        'should reject invalid JWT tokens',
        securityTestCode,
      );

      expect(result.category).toBe('security');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should handle markdown code fences in LLM response', async () => {
      const mockResponse = {
        content:
          '```json\n' +
          JSON.stringify({
            description: 'Test description',
            category: 'functional',
            validators: ['Validator 1'],
            rationale: 'Test rationale',
            confidence: 0.7,
            evidence: ['Evidence 1'],
          }) +
          '\n```',
      };

      llmService.invoke.mockResolvedValue(mockResponse);

      const result = await service.inferAtomFromTest(testFile, testName, testCode);

      expect(result.description).toBe('Test description');
      expect(result.confidence).toBe(0.7);
    });

    it('should handle trailing commas in LLM response', async () => {
      const mockResponse = {
        content: JSON.stringify({
          description: 'Test description',
          category: 'functional',
          validators: ['Validator 1'],
          rationale: 'Test rationale',
          confidence: 0.7,
          evidence: ['Evidence 1'],
        }).replace(']', ',]'), // Add trailing comma
      };

      llmService.invoke.mockResolvedValue(mockResponse);

      const result = await service.inferAtomFromTest(testFile, testName, testCode);

      expect(result).toBeDefined();
      expect(result.description).toBe('Test description');
    });

    it('should normalize invalid category to functional', async () => {
      const mockResponse = {
        content: JSON.stringify({
          description: 'Test description',
          category: 'invalid-category',
          validators: ['Validator 1'],
          rationale: 'Test rationale',
          confidence: 0.8,
          evidence: ['Evidence 1'],
        }),
      };

      llmService.invoke.mockResolvedValue(mockResponse);

      const result = await service.inferAtomFromTest(testFile, testName, testCode);

      expect(result.category).toBe('functional');
      expect(result.confidence).toBeLessThan(0.8); // Reduced due to invalid category
    });

    it('should clamp confidence to 0-1 range', async () => {
      const mockResponse = {
        content: JSON.stringify({
          description: 'Test description',
          category: 'functional',
          validators: ['Validator 1'],
          rationale: 'Test rationale',
          confidence: 1.5, // Invalid: > 1.0
          evidence: ['Evidence 1'],
        }),
      };

      llmService.invoke.mockResolvedValue(mockResponse);

      const result = await service.inferAtomFromTest(testFile, testName, testCode);

      expect(result.confidence).toBeLessThanOrEqual(1.0);
      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
    });

    it('should create fallback atom when LLM parsing fails', async () => {
      const mockResponse = {
        content: 'Invalid JSON response from LLM',
      };

      llmService.invoke.mockResolvedValue(mockResponse);

      const result = await service.inferAtomFromTest(testFile, testName, testCode);

      expect(result).toBeDefined();
      expect(result.description).toContain('send password reset email');
      expect(result.category).toBe('functional');
      expect(result.confidence).toBeLessThan(0.5); // Low confidence for fallback
      expect(result.rationale).toContain('Manual review recommended');
    });

    it('should extract description from test name when too short', async () => {
      const mockResponse = {
        content: JSON.stringify({
          description: 'Test', // Too short
          category: 'functional',
          validators: ['Validator 1'],
          rationale: 'Test rationale',
          confidence: 0.7,
          evidence: ['Evidence 1'],
        }),
      };

      llmService.invoke.mockResolvedValue(mockResponse);

      const result = await service.inferAtomFromTest(
        testFile,
        'should_validate_email_format',
        testCode,
      );

      expect(result.description).toContain('validate email format');
      expect(result.confidence).toBeLessThan(0.7); // Reduced due to short description
    });

    it('should add basic validator when none provided', async () => {
      const mockResponse = {
        content: JSON.stringify({
          description: 'Test description',
          category: 'functional',
          validators: [], // Empty validators
          rationale: 'Test rationale',
          confidence: 0.7,
          evidence: ['Evidence 1'],
        }),
      };

      llmService.invoke.mockResolvedValue(mockResponse);

      const result = await service.inferAtomFromTest(testFile, testName, testCode);

      expect(result.validators).toHaveLength(1);
      expect(result.validators[0]).toBeTruthy();
    });

    it('should extract validator from expect() calls in test code', async () => {
      const testCodeWithExpect = `
        it('test', () => {
          expect(user.email).toBe('test@example.com');
        });
      `;

      const mockResponse = {
        content: 'invalid',
      };

      llmService.invoke.mockResolvedValue(mockResponse);

      const result = await service.inferAtomFromTest(testFile, testName, testCodeWithExpect);

      // Fallback should extract from expect()
      expect(result.validators[0]).toContain('user.email');
    });
  });
});
