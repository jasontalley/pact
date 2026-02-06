import { Test, TestingModule } from '@nestjs/testing';
import { AtomizationController } from './atomization.controller';
import { AtomizationService } from './atomization.service';

describe('AtomizationController', () => {
  let controller: AtomizationController;
  let atomizationService: AtomizationService;

  const mockAtomizationService = {
    atomize: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AtomizationController],
      providers: [
        {
          provide: AtomizationService,
          useValue: mockAtomizationService,
        },
      ],
    }).compile();

    controller = module.get<AtomizationController>(AtomizationController);
    atomizationService = module.get<AtomizationService>(AtomizationService);
    jest.clearAllMocks();
  });

  // @atom IA-025
  describe('controller instantiation', () => {
    // @atom IA-025
    it('should be instantiated by NestJS dependency injection', () => {
      // Controller must be instantiated
      expect(controller).not.toBeNull();
      // Controller must be correct instance
      expect(controller instanceof AtomizationController).toBe(true);
    });
  });

  // @atom IA-026
  describe('POST /agents/atomization/atomize', () => {
    // @atom IA-026
    it('should call atomization service with provided intent', async () => {
      const mockResult = {
        success: true,
        atom: {
          id: 'test-uuid',
          atomId: 'IA-001',
          description: 'Test intent',
          category: 'functional',
          status: 'draft',
        },
        confidence: 0.85,
        analysis: 'Valid atomic intent',
        message: 'Atom created successfully',
      };
      mockAtomizationService.atomize.mockResolvedValue(mockResult);

      const dto = {
        intentDescription: 'Test intent',
        category: 'functional',
      };

      const result = await controller.atomize(dto);

      // Service must be called with the DTO
      expect(mockAtomizationService.atomize).toHaveBeenCalledWith(dto);
      // Result must match service response
      expect(result.success).toBe(true);
      // Atom must be returned
      expect(result.atom).not.toBeNull();
    });

    // @atom IA-026
    it('should return failure result for non-atomic intent', async () => {
      const mockResult = {
        success: false,
        atom: undefined,
        confidence: 0.92,
        analysis: 'Intent is not atomic - combines multiple behaviors',
        message: 'Intent should be decomposed into smaller atoms',
      };
      mockAtomizationService.atomize.mockResolvedValue(mockResult);

      const dto = {
        intentDescription: 'User can login and view dashboard',
      };

      const result = await controller.atomize(dto);

      // Service must be called
      expect(mockAtomizationService.atomize).toHaveBeenCalledWith(dto);
      // Result must indicate failure
      expect(result.success).toBe(false);
      // No atom should be created
      expect(result.atom).toBeUndefined();
    });

    // @atom IA-026
    it('should return failure result for low confidence intent', async () => {
      const mockResult = {
        success: false,
        atom: undefined,
        confidence: 0.55,
        analysis: 'Unable to determine atomicity with confidence',
        message: 'Confidence too low - please clarify intent',
      };
      mockAtomizationService.atomize.mockResolvedValue(mockResult);

      const dto = {
        intentDescription: 'System should be good',
      };

      const result = await controller.atomize(dto);

      // Service must be called
      expect(mockAtomizationService.atomize).toHaveBeenCalledWith(dto);
      // Result must indicate failure
      expect(result.success).toBe(false);
      // Confidence must be below threshold
      expect(result.confidence).toBeLessThan(0.7);
    });

    // @atom IA-026
    it('should pass optional category to service', async () => {
      const mockResult = {
        success: true,
        atom: {
          id: 'test-uuid',
          atomId: 'IA-001',
          description: 'Performance test',
          category: 'performance',
          status: 'draft',
        },
        confidence: 0.89,
        analysis: 'Valid performance intent',
        message: 'Atom created successfully',
      };
      mockAtomizationService.atomize.mockResolvedValue(mockResult);

      const dto = {
        intentDescription: 'Response time must be under 200ms',
        category: 'performance',
      };

      const result = await controller.atomize(dto);

      // Service must be called with category
      expect(mockAtomizationService.atomize).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'performance' }),
      );
      // Result category must match
      expect(result.atom?.category).toBe('performance');
    });
  });
});
