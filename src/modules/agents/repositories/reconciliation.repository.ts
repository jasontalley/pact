import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import {
  ReconciliationRun,
  ReconciliationRunStatus,
  ReconciliationSummary,
} from '../entities/reconciliation-run.entity';
import {
  AtomRecommendation,
  AtomRecommendationStatus,
} from '../entities/atom-recommendation.entity';
import {
  MoleculeRecommendation,
  MoleculeRecommendationStatus,
} from '../entities/molecule-recommendation.entity';
import { TestRecord, TestRecordStatus } from '../entities/test-record.entity';
import {
  InferredAtom,
  InferredMolecule,
  OrphanTestInfo,
} from '../graphs/types/reconciliation-state';

/**
 * Repository for reconciliation agent persistence operations.
 *
 * Handles CRUD operations for:
 * - ReconciliationRun
 * - AtomRecommendation
 * - MoleculeRecommendation
 * - TestRecord
 *
 * @see docs/implementation-checklist-phase5.md Section 3.5-3.6
 */
@Injectable()
export class ReconciliationRepository {
  constructor(
    @InjectRepository(ReconciliationRun)
    private readonly runRepository: Repository<ReconciliationRun>,
    @InjectRepository(AtomRecommendation)
    private readonly atomRecRepository: Repository<AtomRecommendation>,
    @InjectRepository(MoleculeRecommendation)
    private readonly moleculeRecRepository: Repository<MoleculeRecommendation>,
    @InjectRepository(TestRecord)
    private readonly testRecordRepository: Repository<TestRecord>,
    private readonly dataSource: DataSource,
  ) {}

  // ============================================================================
  // ReconciliationRun Operations
  // ============================================================================

  /**
   * Create a new reconciliation run
   */
  async createRun(params: {
    runId: string;
    rootDirectory: string;
    reconciliationMode: 'full-scan' | 'delta';
    deltaBaselineRunId?: string;
    deltaBaselineCommitHash?: string;
    currentCommitHash?: string;
    options?: Record<string, unknown>;
    projectId?: string;
  }): Promise<ReconciliationRun> {
    const run = this.runRepository.create({
      runId: params.runId,
      rootDirectory: params.rootDirectory,
      reconciliationMode: params.reconciliationMode,
      deltaBaselineRunId: params.deltaBaselineRunId || null,
      deltaBaselineCommitHash: params.deltaBaselineCommitHash || null,
      currentCommitHash: params.currentCommitHash || null,
      options: params.options || {},
      projectId: params.projectId || null,
      status: 'running',
    });

    return this.runRepository.save(run);
  }

  /**
   * Update run status and summary
   */
  async updateRunStatus(
    runId: string,
    status: ReconciliationRunStatus,
    summary?: ReconciliationSummary,
    errorMessage?: string,
  ): Promise<void> {
    const update: Record<string, unknown> = { status };

    if (summary) {
      update.summary = summary;
    }

    if (errorMessage) {
      update.errorMessage = errorMessage;
    }

    if (status === 'completed' || status === 'failed') {
      update.completedAt = new Date();
    }

    await this.runRepository.update({ runId }, update);
  }

  /**
   * Store patch ops on a run
   */
  async storePatchOps(runId: string, patchOps: Record<string, unknown>[]): Promise<void> {
    // TypeORM's update types are overly strict for JSONB columns
    await this.runRepository.update({ runId }, { patchOps } as Record<string, unknown>);
  }

  /**
   * Get patch ops for a run
   */
  async getPatchOps(runId: string): Promise<Record<string, unknown>[] | null> {
    const run = await this.runRepository.findOne({
      where: { runId },
      select: ['patchOps'],
    });
    return run?.patchOps as Record<string, unknown>[] | null;
  }

  /**
   * Find run by runId
   */
  async findRunByRunId(runId: string): Promise<ReconciliationRun | null> {
    return this.runRepository.findOne({ where: { runId } });
  }

  /**
   * Find run by UUID
   */
  async findRunById(id: string): Promise<ReconciliationRun | null> {
    return this.runRepository.findOne({ where: { id } });
  }

  /**
   * List recent runs
   */
  async listRuns(options: {
    projectId?: string;
    status?: ReconciliationRunStatus;
    limit?: number;
    offset?: number;
  }): Promise<ReconciliationRun[]> {
    const qb = this.runRepository.createQueryBuilder('run');

    if (options.projectId) {
      qb.andWhere('run.projectId = :projectId', { projectId: options.projectId });
    }

    if (options.status) {
      qb.andWhere('run.status = :status', { status: options.status });
    }

    qb.orderBy('run.createdAt', 'DESC');

    if (options.limit) {
      qb.take(options.limit);
    }

    if (options.offset) {
      qb.skip(options.offset);
    }

    return qb.getMany();
  }

  // ============================================================================
  // AtomRecommendation Operations
  // ============================================================================

  /**
   * Create atom recommendations from inferred atoms
   */
  async createAtomRecommendations(
    runUuid: string,
    inferredAtoms: InferredAtom[],
  ): Promise<AtomRecommendation[]> {
    const recommendations = inferredAtoms.map((atom) =>
      this.atomRecRepository.create({
        runId: runUuid,
        tempId: atom.tempId,
        description: atom.description,
        category: atom.category,
        confidence: atom.confidence,
        reasoning: atom.reasoning,
        sourceTestFilePath: atom.sourceTest.filePath,
        sourceTestName: atom.sourceTest.testName,
        sourceTestLineNumber: atom.sourceTest.lineNumber,
        // Defensive check: observableOutcomes may be undefined if LLM doesn't return it
        observableOutcomes: (atom.observableOutcomes || []).map((o) =>
          typeof o === 'string' ? { description: o } : o,
        ),
        relatedDocs: atom.relatedDocs || [],
        ambiguityReasons: atom.ambiguityReasons || null,
        qualityScore: atom.qualityScore || null,
        status: 'pending',
      }),
    );

    return this.atomRecRepository.save(recommendations);
  }

  /**
   * Update atom recommendation status
   */
  async updateAtomRecommendationStatus(
    id: string,
    status: AtomRecommendationStatus,
    atomId?: string,
    rejectionReason?: string,
  ): Promise<void> {
    const update: Record<string, unknown> = { status };

    if (status === 'accepted') {
      update.acceptedAt = new Date();
      if (atomId) {
        update.atomId = atomId;
      }
    } else if (status === 'rejected') {
      update.rejectedAt = new Date();
      if (rejectionReason) {
        update.rejectionReason = rejectionReason;
      }
    }

    await this.atomRecRepository.update({ id }, update);
  }

  /**
   * Update quality scores for atom recommendations by tempId within a run
   */
  async updateAtomQualityScores(
    runUuid: string,
    scores: Array<{ tempId: string; qualityScore: number }>,
  ): Promise<void> {
    for (const { tempId, qualityScore } of scores) {
      await this.atomRecRepository.update(
        { runId: runUuid, tempId },
        { qualityScore },
      );
    }
  }

  /**
   * Find atom recommendations by run
   */
  async findAtomRecommendationsByRun(runUuid: string): Promise<AtomRecommendation[]> {
    return this.atomRecRepository.find({
      where: { runId: runUuid },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Find atom recommendation by tempId within a run
   */
  async findAtomRecommendationByTempId(
    runUuid: string,
    tempId: string,
  ): Promise<AtomRecommendation | null> {
    return this.atomRecRepository.findOne({
      where: { runId: runUuid, tempId },
    });
  }

  // ============================================================================
  // MoleculeRecommendation Operations
  // ============================================================================

  /**
   * Create molecule recommendations from inferred molecules
   */
  async createMoleculeRecommendations(
    runUuid: string,
    inferredMolecules: InferredMolecule[],
    atomTempIdToUuid: Map<string, string>,
  ): Promise<MoleculeRecommendation[]> {
    const recommendations = inferredMolecules.map((molecule) => {
      // Map temp IDs to UUIDs for cross-reference
      const atomRecommendationIds = molecule.atomTempIds
        .map((tempId) => atomTempIdToUuid.get(tempId))
        .filter((id): id is string => id !== undefined);

      return this.moleculeRecRepository.create({
        runId: runUuid,
        tempId: molecule.tempId,
        name: molecule.name,
        description: molecule.description,
        atomRecommendationTempIds: molecule.atomTempIds,
        atomRecommendationIds,
        atomIds: null,
        confidence: molecule.confidence,
        reasoning: molecule.reasoning,
        status: 'pending',
      });
    });

    return this.moleculeRecRepository.save(recommendations);
  }

  /**
   * Update molecule recommendation status
   */
  async updateMoleculeRecommendationStatus(
    id: string,
    status: MoleculeRecommendationStatus,
    moleculeId?: string,
    atomIds?: string[],
    rejectionReason?: string,
  ): Promise<void> {
    const update: Record<string, unknown> = { status };

    if (status === 'accepted') {
      update.acceptedAt = new Date();
      if (moleculeId) {
        update.moleculeId = moleculeId;
      }
      if (atomIds) {
        update.atomIds = atomIds;
      }
    } else if (status === 'rejected') {
      update.rejectedAt = new Date();
      if (rejectionReason) {
        update.rejectionReason = rejectionReason;
      }
    }

    await this.moleculeRecRepository.update({ id }, update);
  }

  /**
   * Find molecule recommendations by run
   */
  async findMoleculeRecommendationsByRun(runUuid: string): Promise<MoleculeRecommendation[]> {
    return this.moleculeRecRepository.find({
      where: { runId: runUuid },
      order: { createdAt: 'ASC' },
    });
  }

  // ============================================================================
  // TestRecord Operations
  // ============================================================================

  /**
   * Create test records from orphan tests
   */
  async createTestRecords(
    runUuid: string,
    orphanTests: OrphanTestInfo[],
    atomRecommendationMap: Map<string, string>, // testKey -> atomRecommendationId
  ): Promise<TestRecord[]> {
    const records = orphanTests.map((test) => {
      const testKey = `${test.filePath}:${test.testName}`;
      const atomRecommendationId = atomRecommendationMap.get(testKey) || null;

      return this.testRecordRepository.create({
        runId: runUuid,
        filePath: test.filePath,
        testName: test.testName,
        lineNumber: test.lineNumber,
        testCodeHash: test.testCode ? this.hashTestCode(test.testCode) : null,
        status: 'pending',
        atomRecommendationId,
        hadAtomAnnotation: false,
        linkedAtomId: null,
        isDeltaChange: test.isDeltaChange || false,
        // Phase 14: Ingestion Boundary — store test source for quality analysis
        testSourceCode: test.testSourceCode || null,
      });
    });

    return this.testRecordRepository.save(records);
  }

  /**
   * Update test record status
   */
  async updateTestRecordStatus(
    id: string,
    status: TestRecordStatus,
    rejectionReason?: string,
  ): Promise<void> {
    const update: Record<string, unknown> = { status };

    if (status === 'accepted' || status === 'rejected') {
      update.resolvedAt = new Date();
    }

    if (rejectionReason) {
      update.rejectionReason = rejectionReason;
    }

    await this.testRecordRepository.update({ id }, update);
  }

  /**
   * Find closed tests (accepted or rejected) for INV-R002
   *
   * This is critical for the Delta Closure Stopping Rule:
   * Tests that have been accepted or rejected in prior runs
   * should NOT be re-processed in delta reconciliation.
   */
  async findClosedTests(
    filePaths: string[],
  ): Promise<Array<{ filePath: string; testName: string; status: TestRecordStatus }>> {
    if (filePaths.length === 0) {
      return [];
    }

    const results = await this.testRecordRepository
      .createQueryBuilder('tr')
      .select(['tr.filePath', 'tr.testName', 'tr.status'])
      .where('tr.filePath IN (:...filePaths)', { filePaths })
      .andWhere('tr.status IN (:...statuses)', { statuses: ['accepted', 'rejected'] })
      .orderBy('tr.resolvedAt', 'DESC')
      .getMany();

    return results.map((r) => ({
      filePath: r.filePath,
      testName: r.testName,
      status: r.status,
    }));
  }

  /**
   * Check if a specific test is closed
   */
  async isTestClosed(filePath: string, testName: string): Promise<boolean> {
    const count = await this.testRecordRepository.count({
      where: [
        { filePath, testName, status: 'accepted' },
        { filePath, testName, status: 'rejected' },
      ],
    });
    return count > 0;
  }

  // ============================================================================
  // Transaction Support
  // ============================================================================

  /**
   * Create a query runner for transactional operations
   * Per INV-R003: Patch application must be atomic
   */
  async createQueryRunner(): Promise<QueryRunner> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    return queryRunner;
  }

  /**
   * Start a transaction
   */
  async startTransaction(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.startTransaction();
  }

  /**
   * Commit a transaction
   */
  async commitTransaction(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.commitTransaction();
  }

  /**
   * Rollback a transaction
   */
  async rollbackTransaction(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.rollbackTransaction();
  }

  /**
   * Release a query runner
   */
  async releaseQueryRunner(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.release();
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Simple hash function for test code
   * Used for change detection in delta mode
   */
  private hashTestCode(code: string): string {
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      const char = code.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}
