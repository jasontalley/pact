import { Test, TestingModule } from '@nestjs/testing';
import { InvariantCheckingService } from './invariant-checking.service';
import { InvariantsService } from './invariants.service';
import { CheckerRegistry } from './checkers/checker-registry';
import { CheckContext, InvariantCheckResult } from './checkers/interfaces';
import { InvariantConfig } from './invariant-config.entity';
import { Atom } from '../atoms/atom.entity';

describe('InvariantCheckingService', () => {
  let service: InvariantCheckingService;
  let invariantsService: InvariantsService;
  let checkerRegistry: CheckerRegistry;

  const createMockAtom = (overrides: Partial<Atom> = {}): Atom =>
    ({
      id: 'atom-uuid-1',
      atomId: 'IA-001',
      description: 'Test atom description',
      category: 'functional',
      qualityScore: 85,
      status: 'draft',
      supersededBy: null,
      createdAt: new Date(),
      committedAt: null,
      createdBy: 'test-user',
      metadata: {},
      observableOutcomes: [{ description: 'Observable outcome' }],
      falsifiabilityCriteria: [{ condition: 'Condition', expectedBehavior: 'Expected' }],
      tags: ['test'],
      canvasPosition: null,
      parentIntent: 'Original user intent',
      refinementHistory: [],
      validators: [],
      ...overrides,
    }) as Atom;

  const createMockInvariantConfig = (overrides: Partial<InvariantConfig> = {}): InvariantConfig =>
    ({
      id: 'inv-config-uuid',
      projectId: null,
      invariantId: 'INV-001',
      name: 'Test Invariant',
      description: 'Test description',
      isEnabled: true,
      isBlocking: true,
      checkType: 'builtin',
      checkConfig: {},
      errorMessage: 'Error message',
      suggestionPrompt: null,
      isBuiltin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as InvariantConfig;

  const mockInvariantsService = {
    findEnabled: jest.fn(),
    findByInvariantId: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvariantCheckingService,
        CheckerRegistry,
        {
          provide: InvariantsService,
          useValue: mockInvariantsService,
        },
      ],
    }).compile();

    service = module.get<InvariantCheckingService>(InvariantCheckingService);
    invariantsService = module.get<InvariantsService>(InvariantsService);
    checkerRegistry = module.get<CheckerRegistry>(CheckerRegistry);
    jest.clearAllMocks();
  });

  describe('service instantiation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('checkAll', () => {
    const context: CheckContext = {
      committedBy: 'jane.doe@company.com',
      isPreview: false,
    };

    it('should run all enabled invariant checks', async () => {
      const atoms = [createMockAtom()];
      const enabledInvariants = [
        createMockInvariantConfig({ invariantId: 'INV-001' }),
        createMockInvariantConfig({ invariantId: 'INV-004' }),
        createMockInvariantConfig({ invariantId: 'INV-006' }),
      ];

      mockInvariantsService.findEnabled.mockResolvedValue(enabledInvariants);

      const result = await service.checkAll(atoms, context);

      expect(result.results).toHaveLength(3);
      expect(mockInvariantsService.findEnabled).toHaveBeenCalledWith(undefined);
    });

    it('should pass all checks for well-formed atoms', async () => {
      const atoms = [createMockAtom()];
      const enabledInvariants = [
        createMockInvariantConfig({ invariantId: 'INV-001' }),
        createMockInvariantConfig({ invariantId: 'INV-004' }),
        createMockInvariantConfig({ invariantId: 'INV-006' }),
      ];

      mockInvariantsService.findEnabled.mockResolvedValue(enabledInvariants);

      const result = await service.checkAll(atoms, context);

      expect(result.allPassed).toBe(true);
      expect(result.hasBlockingViolations).toBe(false);
      expect(result.passedCount).toBe(3);
      expect(result.failedCount).toBe(0);
    });

    it('should detect INV-004 violation for already committed atoms', async () => {
      const atoms = [createMockAtom({ status: 'committed' })];
      const enabledInvariants = [createMockInvariantConfig({ invariantId: 'INV-004' })];

      mockInvariantsService.findEnabled.mockResolvedValue(enabledInvariants);

      const result = await service.checkAll(atoms, context);

      expect(result.allPassed).toBe(false);
      expect(result.hasBlockingViolations).toBe(true);
      expect(result.failedCount).toBe(1);
      expect(result.blockingIssues).toHaveLength(1);
      expect(result.blockingIssues[0]).toContain('Immutability');
    });

    it('should detect INV-006 violation for agent commits', async () => {
      const atoms = [createMockAtom()];
      const agentContext: CheckContext = {
        committedBy: 'automation-agent',
        isPreview: false,
      };
      const enabledInvariants = [createMockInvariantConfig({ invariantId: 'INV-006' })];

      mockInvariantsService.findEnabled.mockResolvedValue(enabledInvariants);

      const result = await service.checkAll(atoms, agentContext);

      expect(result.allPassed).toBe(false);
      expect(result.hasBlockingViolations).toBe(true);
      const inv006Result = result.results.find((r) => r.invariantId === 'INV-006');
      expect(inv006Result?.passed).toBe(false);
    });

    it('should use project-specific invariants when projectId provided', async () => {
      const atoms = [createMockAtom()];
      const projectContext: CheckContext = {
        committedBy: 'jane@company.com',
        isPreview: false,
        projectId: 'project-uuid',
      };

      mockInvariantsService.findEnabled.mockResolvedValue([]);

      await service.checkAll(atoms, projectContext);

      expect(mockInvariantsService.findEnabled).toHaveBeenCalledWith('project-uuid');
    });

    it('should handle invariants without checkers gracefully', async () => {
      const atoms = [createMockAtom()];
      const enabledInvariants = [
        createMockInvariantConfig({
          invariantId: 'CUSTOM-NO-CHECKER',
          name: 'Custom Without Checker',
        }),
      ];

      mockInvariantsService.findEnabled.mockResolvedValue(enabledInvariants);

      const result = await service.checkAll(atoms, context);

      // Should still return a result (pass with skipped message)
      expect(result.results).toHaveLength(1);
      expect(result.results[0].passed).toBe(true);
      expect(result.results[0].message).toContain('skipped');
    });

    it('should aggregate warnings separately from errors', async () => {
      const atoms = [createMockAtom({ status: 'committed' })];
      const enabledInvariants = [
        createMockInvariantConfig({
          invariantId: 'INV-004',
          isBlocking: true, // error
        }),
        createMockInvariantConfig({
          invariantId: 'INV-001',
          isBlocking: false, // warning
        }),
      ];

      mockInvariantsService.findEnabled.mockResolvedValue(enabledInvariants);

      // Remove committedBy to trigger INV-001 failure as warning
      const warningContext: CheckContext = {
        committedBy: '',
        isPreview: false,
      };

      const result = await service.checkAll(atoms, warningContext);

      expect(result.failedCount).toBe(2);
      expect(result.hasBlockingViolations).toBe(true);
      expect(result.blockingIssues.length).toBeGreaterThan(0);
      expect(result.warningCount).toBe(1);
    });
  });

  describe('checkSingle', () => {
    const context: CheckContext = {
      committedBy: 'jane@company.com',
      isPreview: true,
    };

    it('should run a single invariant check', async () => {
      const atoms = [createMockAtom()];
      const invariantConfig = createMockInvariantConfig({ invariantId: 'INV-001' });

      mockInvariantsService.findByInvariantId.mockResolvedValue(invariantConfig);

      const result = await service.checkSingle(atoms, 'INV-001', context);

      expect(result).not.toBeNull();
      expect(result?.invariantId).toBe('INV-001');
      expect(mockInvariantsService.findByInvariantId).toHaveBeenCalledWith('INV-001', undefined);
    });

    it('should return null when invariant not found', async () => {
      const atoms = [createMockAtom()];

      mockInvariantsService.findByInvariantId.mockResolvedValue(null);

      const result = await service.checkSingle(atoms, 'NON-EXISTENT', context);

      expect(result).toBeNull();
    });

    it('should return null when no checker for invariant', async () => {
      const atoms = [createMockAtom()];
      const invariantConfig = createMockInvariantConfig({
        invariantId: 'CUSTOM-NO-CHECKER',
      });

      mockInvariantsService.findByInvariantId.mockResolvedValue(invariantConfig);

      const result = await service.checkSingle(atoms, 'CUSTOM-NO-CHECKER', context);

      expect(result).toBeNull();
    });
  });

  describe('toSummaryDto', () => {
    it('should convert aggregated results to summary DTO', () => {
      const results = {
        results: [
          {
            invariantId: 'INV-001',
            name: 'Test',
            passed: true,
            severity: 'error' as const,
            message: 'Passed',
            affectedAtomIds: [],
            suggestions: [],
          },
        ],
        allPassed: true,
        hasBlockingViolations: false,
        passedCount: 1,
        failedCount: 0,
        warningCount: 0,
        blockingIssues: [],
        warnings: [],
      };

      const dto = service.toSummaryDto(results);

      expect(dto.allPassed).toBe(true);
      expect(dto.hasBlockingViolations).toBe(false);
      expect(dto.passedCount).toBe(1);
      expect(dto.results).toHaveLength(1);
    });
  });

  describe('toResultDto', () => {
    it('should convert internal result to DTO', () => {
      const result: InvariantCheckResult = {
        invariantId: 'INV-001',
        name: 'Test Invariant',
        passed: false,
        severity: 'error',
        message: 'Test failed',
        affectedAtomIds: ['atom-1', 'atom-2'],
        suggestions: ['Fix this', 'Try that'],
      };

      const dto = service.toResultDto(result);

      expect(dto.invariantId).toBe('INV-001');
      expect(dto.name).toBe('Test Invariant');
      expect(dto.passed).toBe(false);
      expect(dto.severity).toBe('error');
      expect(dto.message).toBe('Test failed');
      expect(dto.affectedAtomIds).toEqual(['atom-1', 'atom-2']);
      expect(dto.suggestions).toEqual(['Fix this', 'Try that']);
    });
  });
});
