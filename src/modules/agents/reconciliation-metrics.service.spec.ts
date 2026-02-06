/**
 * Reconciliation Service Metrics Tests
 *
 * Tests for the quality metrics functionality in ReconciliationService.
 *
 * @see docs/implementation-checklist-phase5.md Section 5.4
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReconciliationService, ReconciliationMetrics } from './reconciliation.service';
import { GraphRegistryService } from './graphs/graph-registry.service';
import { ReconciliationRepository } from './repositories/reconciliation.repository';

describe('ReconciliationService - Metrics', () => {
  let service: ReconciliationService;
  let mockRepository: jest.Mocked<ReconciliationRepository>;
  let mockGraphRegistry: jest.Mocked<GraphRegistryService>;

  const mockRun = {
    id: 'uuid-123',
    runId: 'REC-abc123',
    rootDirectory: '/test/dir',
    reconciliationMode: 'full-scan' as const,
    status: 'completed' as const,
    createdAt: new Date(),
    completedAt: new Date(),
    options: {},
    summary: null,
    deltaBaselineRunId: null,
    deltaBaselineCommitHash: null,
    currentCommitHash: 'abc123',
    errorMessage: null,
    projectId: null,
    atomRecommendations: [],
    moleculeRecommendations: [],
    testRecords: [],
  };

  const mockAtomRecommendations = [
    {
      id: 'atom-1',
      runId: 'uuid-123',
      tempId: 'temp-atom-1',
      description: 'User can authenticate',
      category: 'functional',
      confidence: 85,
      qualityScore: 90,
      status: 'pending' as const,
      createdAt: new Date(),
    },
    {
      id: 'atom-2',
      runId: 'uuid-123',
      tempId: 'temp-atom-2',
      description: 'Session expires after timeout',
      category: 'functional',
      confidence: 75,
      qualityScore: 70,
      status: 'accepted' as const,
      createdAt: new Date(),
    },
    {
      id: 'atom-3',
      runId: 'uuid-123',
      tempId: 'temp-atom-3',
      description: 'Data encrypted at rest',
      category: 'security',
      confidence: 90,
      qualityScore: 95,
      status: 'pending' as const,
      createdAt: new Date(),
    },
    {
      id: 'atom-4',
      runId: 'uuid-123',
      tempId: 'temp-atom-4',
      description: 'Response under 200ms',
      category: 'performance',
      confidence: 60,
      qualityScore: 55,
      status: 'rejected' as const,
      createdAt: new Date(),
    },
  ];

  const mockMoleculeRecommendations = [
    {
      id: 'mol-1',
      runId: 'uuid-123',
      tempId: 'temp-mol-1',
      name: 'Authentication',
      description: 'Auth behaviors',
      confidence: 80,
      status: 'pending' as const,
      createdAt: new Date(),
      atomRecommendationTempIds: ['temp-atom-1', 'temp-atom-2'],
      atomRecommendationIds: ['atom-1', 'atom-2'],
      atomIds: null,
      reasoning: 'Grouped by module',
    },
    {
      id: 'mol-2',
      runId: 'uuid-123',
      tempId: 'temp-mol-2',
      name: 'Security',
      description: 'Security behaviors',
      confidence: 90,
      status: 'accepted' as const,
      createdAt: new Date(),
      atomRecommendationTempIds: ['temp-atom-3'],
      atomRecommendationIds: ['atom-3'],
      atomIds: null,
      reasoning: 'Grouped by category',
    },
  ];

  beforeEach(async () => {
    mockRepository = {
      findRunByRunId: jest.fn(),
      findAtomRecommendationsByRun: jest.fn(),
      findMoleculeRecommendationsByRun: jest.fn(),
    } as unknown as jest.Mocked<ReconciliationRepository>;

    mockGraphRegistry = {
      hasGraph: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<GraphRegistryService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: GraphRegistryService, useValue: mockGraphRegistry },
        { provide: ReconciliationRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
  });

  describe('getMetrics', () => {
    it('should calculate correct average atom confidence', async () => {
      mockRepository.findRunByRunId.mockResolvedValue(mockRun as any);
      mockRepository.findAtomRecommendationsByRun.mockResolvedValue(mockAtomRecommendations as any);
      mockRepository.findMoleculeRecommendationsByRun.mockResolvedValue(
        mockMoleculeRecommendations as any,
      );

      const metrics = await service.getMetrics('REC-abc123');

      // Average: (85 + 75 + 90 + 60) / 4 = 77.5 -> 78
      expect(metrics.averageAtomConfidence).toBe(78);
    });

    it('should calculate correct average atom quality score', async () => {
      mockRepository.findRunByRunId.mockResolvedValue(mockRun as any);
      mockRepository.findAtomRecommendationsByRun.mockResolvedValue(mockAtomRecommendations as any);
      mockRepository.findMoleculeRecommendationsByRun.mockResolvedValue(
        mockMoleculeRecommendations as any,
      );

      const metrics = await service.getMetrics('REC-abc123');

      // Average: (90 + 70 + 95 + 55) / 4 = 77.5 -> 78
      expect(metrics.averageAtomQualityScore).toBe(78);
    });

    it('should calculate correct average molecule confidence', async () => {
      mockRepository.findRunByRunId.mockResolvedValue(mockRun as any);
      mockRepository.findAtomRecommendationsByRun.mockResolvedValue(mockAtomRecommendations as any);
      mockRepository.findMoleculeRecommendationsByRun.mockResolvedValue(
        mockMoleculeRecommendations as any,
      );

      const metrics = await service.getMetrics('REC-abc123');

      // Average: (80 + 90) / 2 = 85
      expect(metrics.averageMoleculeConfidence).toBe(85);
    });

    it('should calculate correct atoms passing/failing threshold', async () => {
      mockRepository.findRunByRunId.mockResolvedValue(mockRun as any);
      mockRepository.findAtomRecommendationsByRun.mockResolvedValue(mockAtomRecommendations as any);
      mockRepository.findMoleculeRecommendationsByRun.mockResolvedValue(
        mockMoleculeRecommendations as any,
      );

      const metrics = await service.getMetrics('REC-abc123', 80);

      // Quality scores: 90, 70, 95, 55 - passing 80: 2 (90, 95)
      expect(metrics.atomsPassingThreshold).toBe(2);
      expect(metrics.atomsFailingThreshold).toBe(2);
      expect(metrics.qualityThreshold).toBe(80);
    });

    it('should calculate correct category distribution', async () => {
      mockRepository.findRunByRunId.mockResolvedValue(mockRun as any);
      mockRepository.findAtomRecommendationsByRun.mockResolvedValue(mockAtomRecommendations as any);
      mockRepository.findMoleculeRecommendationsByRun.mockResolvedValue(
        mockMoleculeRecommendations as any,
      );

      const metrics = await service.getMetrics('REC-abc123');

      expect(metrics.categoryDistribution).toEqual({
        functional: 2,
        security: 1,
        performance: 1,
      });
    });

    it('should calculate correct status distributions', async () => {
      mockRepository.findRunByRunId.mockResolvedValue(mockRun as any);
      mockRepository.findAtomRecommendationsByRun.mockResolvedValue(mockAtomRecommendations as any);
      mockRepository.findMoleculeRecommendationsByRun.mockResolvedValue(
        mockMoleculeRecommendations as any,
      );

      const metrics = await service.getMetrics('REC-abc123');

      expect(metrics.atomStatusDistribution).toEqual({
        pending: 2,
        accepted: 1,
        rejected: 1,
      });

      expect(metrics.moleculeStatusDistribution).toEqual({
        pending: 1,
        accepted: 1,
      });
    });

    it('should return correct totals', async () => {
      mockRepository.findRunByRunId.mockResolvedValue(mockRun as any);
      mockRepository.findAtomRecommendationsByRun.mockResolvedValue(mockAtomRecommendations as any);
      mockRepository.findMoleculeRecommendationsByRun.mockResolvedValue(
        mockMoleculeRecommendations as any,
      );

      const metrics = await service.getMetrics('REC-abc123');

      expect(metrics.totalAtoms).toBe(4);
      expect(metrics.totalMolecules).toBe(2);
      expect(metrics.runId).toBe('REC-abc123');
    });

    it('should throw NotFoundException when run not found', async () => {
      mockRepository.findRunByRunId.mockResolvedValue(null);

      await expect(service.getMetrics('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should handle empty results gracefully', async () => {
      mockRepository.findRunByRunId.mockResolvedValue(mockRun as any);
      mockRepository.findAtomRecommendationsByRun.mockResolvedValue([]);
      mockRepository.findMoleculeRecommendationsByRun.mockResolvedValue([]);

      const metrics = await service.getMetrics('REC-abc123');

      expect(metrics.averageAtomConfidence).toBe(0);
      expect(metrics.averageAtomQualityScore).toBe(0);
      expect(metrics.averageMoleculeConfidence).toBe(0);
      expect(metrics.totalAtoms).toBe(0);
      expect(metrics.totalMolecules).toBe(0);
      expect(metrics.categoryDistribution).toEqual({});
    });

    it('should use default quality threshold of 80', async () => {
      mockRepository.findRunByRunId.mockResolvedValue(mockRun as any);
      mockRepository.findAtomRecommendationsByRun.mockResolvedValue(mockAtomRecommendations as any);
      mockRepository.findMoleculeRecommendationsByRun.mockResolvedValue(
        mockMoleculeRecommendations as any,
      );

      const metrics = await service.getMetrics('REC-abc123');

      expect(metrics.qualityThreshold).toBe(80);
    });

    it('should respect custom quality threshold', async () => {
      mockRepository.findRunByRunId.mockResolvedValue(mockRun as any);
      mockRepository.findAtomRecommendationsByRun.mockResolvedValue(mockAtomRecommendations as any);
      mockRepository.findMoleculeRecommendationsByRun.mockResolvedValue(
        mockMoleculeRecommendations as any,
      );

      // With threshold 60, atoms with scores 90, 70, 95, 55 -> 3 pass (90, 70, 95)
      const metrics = await service.getMetrics('REC-abc123', 60);

      expect(metrics.qualityThreshold).toBe(60);
      expect(metrics.atomsPassingThreshold).toBe(3);
      expect(metrics.atomsFailingThreshold).toBe(1);
    });
  });
});
