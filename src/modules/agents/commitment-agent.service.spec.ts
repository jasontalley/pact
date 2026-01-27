import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  CommitmentAgentService,
  ProposeAtomsDto,
  ExecuteCommitmentDto,
} from './commitment-agent.service';
import { Atom } from '../atoms/atom.entity';
import { AgentAction } from './agent-action.entity';
import { AtomizationService } from './atomization.service';
import { IntentRefinementService } from './intent-refinement.service';
import { CommitmentsService } from '../commitments/commitments.service';
import { InvariantCheckingService } from '../invariants/invariant-checking.service';
import { LLMService, LLMResponse } from '../../common/llm/llm.service';

/**
 * Tests for CommitmentAgentService
 *
 * Related atoms:
 * - IA-PHASE3-002: Agent-driven commitment flow with human approval
 * - INV-006: Only humans may authorize commitment
 */
describe('CommitmentAgentService', () => {
  let service: CommitmentAgentService;
  let atomRepository: jest.Mocked<Repository<Atom>>;
  let agentActionRepository: jest.Mocked<Repository<AgentAction>>;
  let llmService: jest.Mocked<LLMService>;
  let atomizationService: jest.Mocked<AtomizationService>;
  let intentRefinementService: jest.Mocked<IntentRefinementService>;
  let commitmentsService: jest.Mocked<CommitmentsService>;
  let invariantCheckingService: jest.Mocked<InvariantCheckingService>;

  const mockAtom = (overrides: Partial<Atom> = {}): Atom =>
    ({
      id: 'atom-uuid-1',
      atomId: 'IA-001',
      description: 'Test atom description',
      category: 'functional',
      qualityScore: 85,
      status: 'draft',
      createdBy: 'test-user',
      createdAt: new Date(),
      committedAt: null,
      metadata: {},
      observableOutcomes: [{ description: 'Observable outcome' }],
      falsifiabilityCriteria: [{ condition: 'Condition', expectedBehavior: 'Expected' }],
      tags: [],
      ...overrides,
    }) as Atom;

  const mockLLMResponse = (content: string): LLMResponse => ({
    requestId: 'test-request-id',
    content,
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    cost: 0.001,
    latencyMs: 500,
    cacheHit: false,
    retryCount: 0,
    modelUsed: 'gpt-4',
    providerUsed: 'openai',
  });

  const mockLLMDecompositionResponse = {
    success: true,
    atomicIntents: [
      {
        description: 'User can login with valid credentials',
        category: 'functional',
        observableOutcomes: [{ description: 'User sees dashboard after login' }],
        falsifiabilityCriteria: [
          { condition: 'Invalid credentials', expectedBehavior: 'Login rejected' },
        ],
      },
      {
        description: 'User sees error message with invalid credentials',
        category: 'functional',
        observableOutcomes: [{ description: 'Error message displayed' }],
        falsifiabilityCriteria: [
          { condition: 'Valid credentials', expectedBehavior: 'No error shown' },
        ],
      },
    ],
    analysis: 'Decomposed authentication feature into login and error handling atoms',
    suggestions: ['Consider adding session timeout atom'],
    confidence: 0.9,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommitmentAgentService,
        {
          provide: getRepositoryToken(Atom),
          useValue: {
            findByIds: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AgentAction),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('0.7'),
          },
        },
        {
          provide: LLMService,
          useValue: {
            invoke: jest.fn(),
          },
        },
        {
          provide: AtomizationService,
          useValue: {
            atomize: jest.fn(),
          },
        },
        {
          provide: IntentRefinementService,
          useValue: {
            refineAtom: jest.fn(),
          },
        },
        {
          provide: CommitmentsService,
          useValue: {
            preview: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: InvariantCheckingService,
          useValue: {
            checkSingle: jest.fn(),
            checkAll: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CommitmentAgentService>(CommitmentAgentService);
    atomRepository = module.get(getRepositoryToken(Atom));
    agentActionRepository = module.get(getRepositoryToken(AgentAction));
    llmService = module.get(LLMService);
    atomizationService = module.get(AtomizationService);
    intentRefinementService = module.get(IntentRefinementService);
    commitmentsService = module.get(CommitmentsService);
    invariantCheckingService = module.get(InvariantCheckingService);

    // Setup default mocks
    agentActionRepository.create.mockImplementation(
      (data) => ({ id: 'action-uuid', ...data }) as AgentAction,
    );
    agentActionRepository.save.mockImplementation((action) =>
      Promise.resolve({ ...action, id: 'action-uuid' } as AgentAction),
    );
  });

  /**
   * @atom IA-PHASE3-002
   * Service must be properly instantiated by NestJS DI
   */
  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('proposeAtomsFromIntent', () => {
    const proposeDto: ProposeAtomsDto = {
      molecularIntent: 'User authentication system with login and error handling',
      category: 'functional',
      requestedBy: 'jane.doe@company.com',
    };

    /**
     * @atom IA-PHASE3-002
     * Agent must decompose molecular intents into atomic intents using LLM
     */
    it('should decompose molecular intent into atomic intents', async () => {
      llmService.invoke.mockResolvedValue(
        mockLLMResponse(JSON.stringify(mockLLMDecompositionResponse)),
      );

      atomizationService.atomize.mockResolvedValue({
        success: true,
        confidence: 0.85,
        analysis: 'Valid atomic intent',
        qualityValidation: {
          totalScore: 85,
          decision: 'approve',
          overallFeedback: 'Good quality',
          actionableImprovements: [],
        },
      });

      const result = await service.proposeAtomsFromIntent(proposeDto);

      expect(result.success).toBe(true);
      expect(result.proposedAtoms).toHaveLength(2);
      expect(result.proposedAtoms[0].tempId).toBe('TEMP-1');
      expect(result.proposedAtoms[0].description).toBe('User can login with valid credentials');
      expect(result.confidence).toBe(0.9);
    });

    /**
     * @atom IA-PHASE3-002
     * Agent must validate quality of each proposed atom
     */
    it('should include quality scores for proposed atoms', async () => {
      llmService.invoke.mockResolvedValue(
        mockLLMResponse(JSON.stringify(mockLLMDecompositionResponse)),
      );

      atomizationService.atomize.mockResolvedValue({
        success: true,
        confidence: 0.85,
        analysis: 'Valid atomic intent',
        qualityValidation: {
          totalScore: 85,
          decision: 'approve',
          overallFeedback: 'Good quality',
          actionableImprovements: [],
        },
      });

      const result = await service.proposeAtomsFromIntent(proposeDto);

      expect(result.proposedAtoms[0].qualityScore).toBe(85);
      expect(result.proposedAtoms[0].qualityFeedback).toBe('Good quality');
    });

    /**
     * @atom IA-PHASE3-002
     * Agent must handle LLM decomposition failures gracefully
     */
    it('should return failure when LLM decomposition fails', async () => {
      llmService.invoke.mockResolvedValue(
        mockLLMResponse(
          JSON.stringify({
            success: false,
            atomicIntents: [],
            analysis: 'Intent is too vague to decompose',
            suggestions: ['Provide more specific requirements'],
            confidence: 0.3,
          }),
        ),
      );

      const result = await service.proposeAtomsFromIntent(proposeDto);

      expect(result.success).toBe(false);
      expect(result.proposedAtoms).toHaveLength(0);
      expect(result.suggestions).toContain('Provide more specific requirements');
    });

    /**
     * @atom IA-PHASE3-002
     * Agent must log all actions for audit trail
     */
    it('should log agent action', async () => {
      llmService.invoke.mockResolvedValue(
        mockLLMResponse(JSON.stringify(mockLLMDecompositionResponse)),
      );

      atomizationService.atomize.mockResolvedValue({
        success: true,
        confidence: 0.85,
        analysis: 'Valid atomic intent',
      });

      await service.proposeAtomsFromIntent(proposeDto);

      expect(agentActionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'propose_atoms',
          input: proposeDto,
        }),
      );
      expect(agentActionRepository.save).toHaveBeenCalled();
    });
  });

  describe('reviewAndRefine', () => {
    /**
     * @atom IA-PHASE3-002
     * Agent must refine atoms based on user feedback
     */
    it('should refine atoms based on feedback', async () => {
      const atoms = [mockAtom()];
      const refinedAtom = {
        ...atoms[0],
        description: 'User can login with email and password',
      } as Atom;
      const feedback = 'Make the intent more specific about authentication method';

      (intentRefinementService.refineAtom as jest.Mock).mockResolvedValue({
        success: true,
        atom: {
          id: atoms[0].id,
          atomId: atoms[0].atomId,
          description: 'User can login with email and password',
          qualityScore: 85,
        },
        previousDescription: atoms[0].description,
        refinementRecord: {
          timestamp: new Date(),
          previousDescription: atoms[0].description,
          newDescription: 'User can login with email and password',
          feedback,
          source: 'ai',
        },
        message: 'Refined successfully',
      });

      atomRepository.findOne.mockResolvedValue(refinedAtom);

      const result = await service.reviewAndRefine(atoms, feedback, 'jane@company.com');

      expect(result).toHaveLength(1);
      expect(intentRefinementService.refineAtom).toHaveBeenCalledWith(atoms[0].id, feedback);
    });

    /**
     * @atom IA-PHASE3-002
     * Agent must preserve original atom when refinement fails
     */
    it('should keep original atom if refinement fails', async () => {
      const atoms = [mockAtom()];
      const feedback = 'Invalid feedback';

      (intentRefinementService.refineAtom as jest.Mock).mockRejectedValue(
        new Error('Unable to refine with provided feedback'),
      );

      const result = await service.reviewAndRefine(atoms, feedback, 'jane@company.com');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(atoms[0]);
    });
  });

  describe('prepareCommitment', () => {
    const atomIds = ['atom-uuid-1', 'atom-uuid-2'];

    /**
     * @atom IA-PHASE3-002
     * Agent must run invariant preview before commitment
     */
    it('should run commitment preview with invariant checks', async () => {
      const atoms = [mockAtom(), mockAtom({ id: 'atom-uuid-2', atomId: 'IA-002' })];

      atomRepository.findByIds.mockResolvedValue(atoms);
      commitmentsService.preview.mockResolvedValue({
        canCommit: true,
        hasBlockingIssues: false,
        hasWarnings: false,
        atoms: [],
        invariantChecks: [
          {
            invariantId: 'INV-001',
            name: 'Test',
            passed: true,
            severity: 'error',
            message: 'Passed',
          },
        ],
        atomCount: 2,
      });

      const result = await service.prepareCommitment(atomIds, 'jane@company.com');

      expect(result.canCommit).toBe(true);
      expect(result.atomIds).toEqual(atomIds);
      expect(commitmentsService.preview).toHaveBeenCalled();
    });

    /**
     * @atom IA-PHASE3-002
     * Agent must report blocking issues from invariant checks
     */
    it('should report blocking issues when invariants fail', async () => {
      const atoms = [mockAtom({ status: 'committed' })];

      atomRepository.findByIds.mockResolvedValue(atoms);
      commitmentsService.preview.mockResolvedValue({
        canCommit: false,
        hasBlockingIssues: true,
        hasWarnings: false,
        atoms: [],
        invariantChecks: [
          {
            invariantId: 'INV-004',
            name: 'Immutability',
            passed: false,
            severity: 'error',
            message: 'Atom already committed',
          },
        ],
        atomCount: 1,
        blockingIssues: ['Atom already committed'],
      });

      const result = await service.prepareCommitment(['atom-uuid-1'], 'jane@company.com');

      expect(result.canCommit).toBe(false);
      expect(result.issues).toContain('Atom already committed');
    });

    /**
     * @atom IA-PHASE3-002
     * Agent must throw error when atoms not found
     */
    it('should throw error when atoms not found', async () => {
      atomRepository.findByIds.mockResolvedValue([mockAtom()]);

      await expect(
        service.prepareCommitment(['atom-uuid-1', 'missing-uuid'], 'jane@company.com'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('executeCommitment', () => {
    const executeDto: ExecuteCommitmentDto = {
      atomIds: ['atom-uuid-1'],
      committedBy: 'jane.doe@company.com',
      humanApproval: true,
    };

    /**
     * @atom INV-006
     * Agent must require human approval before executing commitment
     */
    it('should require human approval', async () => {
      const dtoWithoutApproval: ExecuteCommitmentDto = {
        ...executeDto,
        humanApproval: false,
      };

      await expect(service.executeCommitment(dtoWithoutApproval)).rejects.toThrow(
        'Human approval is required to execute commitment (INV-006)',
      );
    });

    /**
     * @atom INV-006
     * Agent must verify committedBy is not an agent identifier
     */
    it('should reject commitment from agent identifiers', async () => {
      const agentDto: ExecuteCommitmentDto = {
        ...executeDto,
        committedBy: 'automation-agent',
      };

      atomRepository.findByIds.mockResolvedValue([mockAtom()]);
      invariantCheckingService.checkSingle.mockResolvedValue({
        invariantId: 'INV-006',
        name: 'Human Commit',
        passed: false,
        severity: 'error',
        message: 'Commitment appears to be from an agent',
        affectedAtomIds: [],
        suggestions: [],
      });

      await expect(service.executeCommitment(agentDto)).rejects.toThrow(
        'Cannot execute commitment: Commitment appears to be from an agent',
      );
    });

    /**
     * @atom IA-PHASE3-002
     * Agent must create commitment when all checks pass
     */
    it('should create commitment when all checks pass', async () => {
      const commitment = {
        id: 'commitment-uuid',
        commitmentId: 'COM-001',
        committedBy: executeDto.committedBy,
        canonicalJson: [],
        committedAt: new Date(),
      };

      atomRepository.findByIds.mockResolvedValue([mockAtom()]);
      invariantCheckingService.checkSingle.mockResolvedValue({
        invariantId: 'INV-006',
        name: 'Human Commit',
        passed: true,
        severity: 'error',
        message: 'Commitment authorized by human',
        affectedAtomIds: [],
        suggestions: [],
      });
      commitmentsService.create.mockResolvedValue(commitment as any);

      const result = await service.executeCommitment(executeDto);

      expect(result.commitmentId).toBe('COM-001');
      expect(commitmentsService.create).toHaveBeenCalledWith({
        atomIds: executeDto.atomIds,
        committedBy: executeDto.committedBy,
        projectId: undefined,
        moleculeId: undefined,
        overrideJustification: undefined,
      });
    });

    /**
     * @atom IA-PHASE3-002
     * Agent must log commitment actions for audit trail
     */
    it('should log commitment action', async () => {
      atomRepository.findByIds.mockResolvedValue([mockAtom()]);
      invariantCheckingService.checkSingle.mockResolvedValue({
        invariantId: 'INV-006',
        name: 'Human Commit',
        passed: true,
        severity: 'error',
        message: 'OK',
        affectedAtomIds: [],
        suggestions: [],
      });
      commitmentsService.create.mockResolvedValue({
        id: 'commitment-uuid',
        commitmentId: 'COM-001',
      } as any);

      await service.executeCommitment(executeDto);

      expect(agentActionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'execute_commitment',
          input: executeDto,
          metadata: expect.objectContaining({
            status: 'started',
            humanApproval: true,
          }),
        }),
      );
    });

    /**
     * @atom IA-PHASE3-002
     * Agent must support override justification for non-blocking warnings
     */
    it('should pass override justification to commitment service', async () => {
      const dtoWithOverride: ExecuteCommitmentDto = {
        ...executeDto,
        overrideJustification: 'Approved by PM for urgent release',
      };

      atomRepository.findByIds.mockResolvedValue([mockAtom()]);
      invariantCheckingService.checkSingle.mockResolvedValue({
        invariantId: 'INV-006',
        name: 'Human Commit',
        passed: true,
        severity: 'error',
        message: 'OK',
        affectedAtomIds: [],
        suggestions: [],
      });
      commitmentsService.create.mockResolvedValue({
        id: 'commitment-uuid',
        commitmentId: 'COM-001',
      } as any);

      await service.executeCommitment(dtoWithOverride);

      expect(commitmentsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          overrideJustification: 'Approved by PM for urgent release',
        }),
      );
    });
  });
});
