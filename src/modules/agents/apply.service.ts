/**
 * Apply Service
 *
 * Service for applying reconciliation patches to create Atoms and Molecules.
 * Implements transactional application per INV-R003.
 *
 * **INV-R003: Patch Atomicity**
 * - Wrap all DB operations in a single transaction
 * - If ANY op fails, rollback ALL ops in that apply attempt
 * - For file modifications (@atom injection), use two-phase approach
 * - Return clear success/partial-success/failure status
 *
 * @see docs/implementation-checklist-phase5.md Section 6.2
 */

import * as path from 'path';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
  Inject,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { ReconciliationRepository } from './repositories/reconciliation.repository';
import { AtomRecommendation } from './entities/atom-recommendation.entity';
import { MoleculeRecommendation } from './entities/molecule-recommendation.entity';
import { Atom } from '../atoms/atom.entity';
import { Molecule } from '../molecules/molecule.entity';
import { MoleculeAtom } from '../molecules/molecule-atom.entity';
import { ChangeSetMetadata, ChangeSetStatus } from '../molecules/change-set.types';
import {
  ContentProvider,
  WriteProvider,
  FilesystemContentProvider,
  FilesystemWriteProvider,
} from './content';
import { CONTENT_PROVIDER } from './context-builder.service';

/**
 * Injection token for WriteProvider
 */
export const WRITE_PROVIDER = Symbol('WRITE_PROVIDER');

/**
 * Apply request
 */
export interface ApplyRequest {
  /** Run ID to apply */
  runId: string;
  /** Specific recommendation IDs to apply (empty = all approved) */
  selections?: string[];
  /** Whether to inject @atom annotations into test files */
  injectAnnotations?: boolean;
}

/**
 * Individual operation result
 */
export interface ApplyOpResult {
  /** Operation type */
  type: 'createAtom' | 'createMolecule' | 'attachTestToAtom';
  /** Recommendation ID */
  recommendationId: string;
  /** Whether the operation succeeded */
  success: boolean;
  /** Created entity ID if successful */
  entityId?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Apply result
 */
export interface ApplyResult {
  /** Run ID */
  runId: string;
  /** Overall status */
  status: 'success' | 'partial' | 'failed' | 'rolled_back';
  /** Number of atoms created */
  atomsCreated: number;
  /** Number of molecules created */
  moleculesCreated: number;
  /** Number of test annotations injected */
  annotationsInjected: number;
  /** Individual operation results */
  operations: ApplyOpResult[];
  /** Error message if failed */
  error?: string;
}

/**
 * File modification to apply after DB commit
 */
interface FileModification {
  filePath: string;
  atomId: string;
  testName: string;
  lineNumber: number;
}

@Injectable()
export class ApplyService {
  private readonly logger = new Logger(ApplyService.name);
  private contentProvider: ContentProvider;
  private writeProvider: WriteProvider;

  constructor(
    private readonly dataSource: DataSource,
    private readonly repository: ReconciliationRepository,
    @Optional() @Inject(CONTENT_PROVIDER) contentProvider?: ContentProvider,
    @Optional() @Inject(WRITE_PROVIDER) writeProvider?: WriteProvider,
  ) {
    this.contentProvider = contentProvider || new FilesystemContentProvider();
    this.writeProvider = writeProvider || new FilesystemWriteProvider();
  }

  /**
   * Set content and write providers (useful for testing or dynamic configuration)
   */
  setProviders(contentProvider?: ContentProvider, writeProvider?: WriteProvider): void {
    if (contentProvider) this.contentProvider = contentProvider;
    if (writeProvider) this.writeProvider = writeProvider;
  }

  /**
   * Apply selected recommendations from a reconciliation run.
   *
   * **INV-R003 Implementation**:
   * 1. All DB operations happen in a single transaction
   * 2. If any DB operation fails, entire transaction is rolled back
   * 3. File modifications only happen after successful DB commit
   * 4. File modification failures are logged but don't rollback DB
   *
   * @param request - Apply request with run ID and selections
   * @returns Apply result with created entities
   */
  async applyPatch(request: ApplyRequest): Promise<ApplyResult> {
    const { runId, selections, injectAnnotations = false } = request;

    this.logger.log(`Applying patch for run ${runId} (selections: ${selections?.length || 'all'})`);

    // Find the run
    const run = await this.repository.findRunByRunId(runId);
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    // Get recommendations to apply
    const atomRecs = await this.repository.findAtomRecommendationsByRun(run.id);
    const moleculeRecs = await this.repository.findMoleculeRecommendationsByRun(run.id);

    // Filter to selected recommendations (or all pending)
    const atomsToApply = selections
      ? atomRecs.filter((a) => selections.includes(a.id) || selections.includes(a.tempId))
      : atomRecs.filter((a) => a.status === 'pending');

    const moleculesToApply = selections
      ? moleculeRecs.filter((m) => selections.includes(m.id) || selections.includes(m.tempId))
      : moleculeRecs.filter((m) => m.status === 'pending');

    if (atomsToApply.length === 0 && moleculesToApply.length === 0) {
      throw new BadRequestException('No recommendations to apply');
    }

    this.logger.log(
      `Applying ${atomsToApply.length} atoms and ${moleculesToApply.length} molecules`,
    );

    // Track results
    const operations: ApplyOpResult[] = [];
    const fileModifications: FileModification[] = [];
    let atomsCreated = 0;
    let moleculesCreated = 0;

    // Map from tempId to created atomId
    const tempIdToAtomId = new Map<string, string>();

    // Start transaction for INV-R003
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Phase 1: Create all atoms
      for (const atomRec of atomsToApply) {
        try {
          const atom = await this.createAtomFromRecommendation(queryRunner, atomRec);
          tempIdToAtomId.set(atomRec.tempId, atom.id);

          // Update recommendation with created atom ID
          await queryRunner.manager.update(
            AtomRecommendation,
            { id: atomRec.id },
            { atomId: atom.id, status: 'accepted', acceptedAt: new Date() },
          );

          operations.push({
            type: 'createAtom',
            recommendationId: atomRec.id,
            success: true,
            entityId: atom.id,
          });

          atomsCreated++;

          // Track file modification for later
          if (injectAnnotations && atomRec.sourceTestFilePath) {
            fileModifications.push({
              filePath: atomRec.sourceTestFilePath,
              atomId: atom.atomId, // Human-readable ID like "IA-001"
              testName: atomRec.sourceTestName,
              lineNumber: atomRec.sourceTestLineNumber || 1,
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to create atom for ${atomRec.id}: ${errorMessage}`);

          operations.push({
            type: 'createAtom',
            recommendationId: atomRec.id,
            success: false,
            error: errorMessage,
          });

          // INV-R003: Any failure triggers rollback
          throw new Error(`Failed to create atom ${atomRec.tempId}: ${errorMessage}`);
        }
      }

      // Phase 2: Create all molecules (after atoms so we can link)
      for (const moleculeRec of moleculesToApply) {
        try {
          // Map temp IDs to actual atom IDs
          const atomIds = moleculeRec.atomRecommendationTempIds
            .map((tempId) => tempIdToAtomId.get(tempId))
            .filter((id): id is string => id !== undefined);

          if (atomIds.length === 0) {
            this.logger.warn(`Skipping molecule ${moleculeRec.id} - no valid atom IDs found`);
            continue;
          }

          const molecule = await this.createMoleculeFromRecommendation(
            queryRunner,
            moleculeRec,
            atomIds,
          );

          // Update recommendation with created molecule ID
          await queryRunner.manager.update(
            MoleculeRecommendation,
            { id: moleculeRec.id },
            {
              moleculeId: molecule.id,
              atomIds,
              status: 'accepted',
              acceptedAt: new Date(),
            },
          );

          operations.push({
            type: 'createMolecule',
            recommendationId: moleculeRec.id,
            success: true,
            entityId: molecule.id,
          });

          moleculesCreated++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to create molecule for ${moleculeRec.id}: ${errorMessage}`);

          operations.push({
            type: 'createMolecule',
            recommendationId: moleculeRec.id,
            success: false,
            error: errorMessage,
          });

          // INV-R003: Any failure triggers rollback
          throw new Error(`Failed to create molecule ${moleculeRec.tempId}: ${errorMessage}`);
        }
      }

      // Commit transaction
      await queryRunner.commitTransaction();
      this.logger.log(
        `Transaction committed: ${atomsCreated} atoms, ${moleculesCreated} molecules`,
      );
    } catch (error) {
      // INV-R003: Rollback on any error
      await queryRunner.rollbackTransaction();
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Transaction rolled back: ${errorMessage}`);

      return {
        runId,
        status: 'rolled_back',
        atomsCreated: 0,
        moleculesCreated: 0,
        annotationsInjected: 0,
        operations,
        error: errorMessage,
      };
    } finally {
      await queryRunner.release();
    }

    // Phase 3: Apply file modifications (after DB commit, per INV-R003)
    let annotationsInjected = 0;

    if (injectAnnotations && fileModifications.length > 0) {
      for (const mod of fileModifications) {
        try {
          await this.injectAtomAnnotation(mod, run.rootDirectory);
          annotationsInjected++;

          operations.push({
            type: 'attachTestToAtom',
            recommendationId: mod.atomId,
            success: true,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Failed to inject annotation in ${mod.filePath}: ${errorMessage}. ` +
              `DB changes are preserved per INV-R003.`,
          );

          operations.push({
            type: 'attachTestToAtom',
            recommendationId: mod.atomId,
            success: false,
            error: errorMessage,
          });
          // Don't throw - file modifications don't rollback DB
        }
      }
    }

    // Determine final status
    const allSuccess = operations.every((op) => op.success);
    const anySuccess = operations.some((op) => op.success);
    const status = allSuccess ? 'success' : anySuccess ? 'partial' : 'failed';

    this.logger.log(
      `Apply complete: ${status} - ${atomsCreated} atoms, ${moleculesCreated} molecules, ` +
        `${annotationsInjected} annotations`,
    );

    return {
      runId,
      status,
      atomsCreated,
      moleculesCreated,
      annotationsInjected,
      operations,
    };
  }

  /**
   * Create an Atom entity from a recommendation.
   */
  private async createAtomFromRecommendation(
    queryRunner: QueryRunner,
    atomRec: AtomRecommendation,
  ): Promise<Atom> {
    // Generate atomId (e.g., "IA-001")
    const atomIdResult = await queryRunner.manager.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING("atomId" FROM 4) AS INTEGER)), 0) + 1 as next_id FROM atoms WHERE "atomId" LIKE 'IA-%'`,
    );
    const nextId = atomIdResult[0]?.next_id || 1;
    const atomId = `IA-${String(nextId).padStart(3, '0')}`;

    // Observable outcomes are already in the correct format from the entity
    const observableOutcomes = atomRec.observableOutcomes.map((o) => ({
      description: o.description,
      measurementCriteria: o.measurementCriteria,
    }));

    const atom = queryRunner.manager.create(Atom, {
      atomId,
      description: atomRec.description,
      category: atomRec.category,
      qualityScore: atomRec.qualityScore || atomRec.confidence,
      status: 'draft',
      observableOutcomes,
      metadata: {
        source: 'reconciliation',
        confidence: atomRec.confidence,
        reasoning: atomRec.reasoning,
        sourceTest: {
          filePath: atomRec.sourceTestFilePath,
          testName: atomRec.sourceTestName,
          lineNumber: atomRec.sourceTestLineNumber,
        },
        tempId: atomRec.tempId,
      },
    });

    return queryRunner.manager.save(Atom, atom);
  }

  /**
   * Create a Molecule entity from a recommendation.
   */
  private async createMoleculeFromRecommendation(
    queryRunner: QueryRunner,
    moleculeRec: MoleculeRecommendation,
    atomIds: string[],
  ): Promise<Molecule> {
    // Generate moleculeId (e.g., "M-001")
    const moleculeIdResult = await queryRunner.manager.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING("moleculeId" FROM 3) AS INTEGER)), 0) + 1 as next_id FROM molecules WHERE "moleculeId" LIKE 'M-%'`,
    );
    const nextId = moleculeIdResult[0]?.next_id || 1;
    const moleculeId = `M-${String(nextId).padStart(3, '0')}`;

    const molecule = queryRunner.manager.create(Molecule, {
      moleculeId,
      name: moleculeRec.name,
      description: moleculeRec.description,
      lensType: 'feature', // Default lens type for reconciliation-generated molecules
      ownerId: 'reconciliation-agent',
      tags: [],
      metadata: {
        source: 'reconciliation',
        confidence: moleculeRec.confidence,
        reasoning: moleculeRec.reasoning,
        tempId: moleculeRec.tempId,
      },
    });

    const savedMolecule = await queryRunner.manager.save(Molecule, molecule);

    // Create MoleculeAtom junction records to link atoms
    for (let i = 0; i < atomIds.length; i++) {
      const moleculeAtom = queryRunner.manager.create(MoleculeAtom, {
        moleculeId: savedMolecule.id,
        atomId: atomIds[i],
        order: i,
        note: null,
        addedBy: 'reconciliation-agent',
        removedAt: null,
        removedBy: null,
      });
      await queryRunner.manager.save(MoleculeAtom, moleculeAtom);
    }

    return savedMolecule;
  }

  /**
   * Inject @atom annotation into a test file.
   *
   * Adds a comment like `// @atom IA-001` before the test function.
   * Uses ContentProvider for reading and WriteProvider for writing.
   */
  private async injectAtomAnnotation(mod: FileModification, rootDirectory?: string): Promise<void> {
    const { filePath, atomId, lineNumber } = mod;

    // Resolve relative paths against root directory
    let resolvedPath: string;
    if (path.isAbsolute(filePath)) {
      resolvedPath = filePath;
    } else if (rootDirectory && path.isAbsolute(rootDirectory)) {
      resolvedPath = path.resolve(rootDirectory, filePath);
    } else {
      // Pre-read (browser upload) run — files aren't on the server filesystem
      throw new Error(
        `Cannot inject annotation: file ${filePath} is not accessible on the server. ` +
          `For browser-uploaded repositories, add annotations manually: // @atom ${atomId}`,
      );
    }

    // Check file exists and read content
    const content = await this.contentProvider.readFileOrNull(resolvedPath);
    if (content === null) {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    const lines = content.split('\n');

    // Find the line to annotate (0-indexed)
    const targetLine = lineNumber - 1;
    if (targetLine < 0 || targetLine >= lines.length) {
      throw new Error(`Invalid line number ${lineNumber} for file ${filePath}`);
    }

    // Check if already annotated
    const prevLine = targetLine > 0 ? lines[targetLine - 1] : '';
    if (prevLine.includes(`@atom ${atomId}`) || prevLine.includes(`@atom: ${atomId}`)) {
      this.logger.log(`File ${filePath} already has @atom annotation for ${atomId}`);
      return;
    }

    // Get indentation from target line
    const indentMatch = lines[targetLine].match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';

    // Insert annotation comment using WriteProvider
    const annotation = `// @atom ${atomId}`;
    await this.writeProvider.insertLine(resolvedPath, lineNumber, `${indent}${annotation}`);
    this.logger.log(`Injected @atom ${atomId} annotation in ${resolvedPath}:${lineNumber}`);
  }

  // ========================================
  // Governed Change Set Creation (Phase 15)
  // ========================================

  /**
   * Create a governed change set from a reconciliation run.
   * Instead of applying recommendations directly (creating draft atoms),
   * this creates a change set molecule with proposed atoms that must go
   * through the approval workflow before being committed to Main.
   *
   * @param request - Run ID, selections, and optional metadata
   * @returns Change set ID, atom count, and molecule ID
   */
  async createChangeSetFromRun(request: {
    runId: string;
    selections?: string[];
    name?: string;
    description?: string;
  }): Promise<{ changeSetId: string; atomCount: number; moleculeId: string }> {
    const { runId, selections, name, description } = request;

    this.logger.log(`Creating change set from run ${runId}`);

    // Find the run
    const run = await this.repository.findRunByRunId(runId);
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    // Get recommendations
    const atomRecs = await this.repository.findAtomRecommendationsByRun(run.id);
    const moleculeRecs = await this.repository.findMoleculeRecommendationsByRun(run.id);

    // Filter to selected recommendations (or all pending)
    const atomsToApply = selections
      ? atomRecs.filter((a) => selections.includes(a.id) || selections.includes(a.tempId))
      : atomRecs.filter((a) => a.status === 'pending');

    if (atomsToApply.length === 0) {
      throw new BadRequestException('No atom recommendations to include in change set');
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Generate molecule ID for the change set
      const moleculeIdResult = await queryRunner.manager.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING("moleculeId" FROM 3) AS INTEGER)), 0) + 1 as next_id FROM molecules WHERE "moleculeId" LIKE 'M-%'`,
      );
      const nextMoleculeId = moleculeIdResult[0]?.next_id || 1;
      const moleculeIdStr = `M-${String(nextMoleculeId).padStart(3, '0')}`;

      // 2. Create change set molecule
      const changeSetMetadata: ChangeSetMetadata = {
        status: 'draft' as ChangeSetStatus,
        createdBy: 'reconciliation-agent',
        summary: description || `Change set from reconciliation run ${runId}`,
        sourceRef: runId,
        source: 'reconciliation',
        reconciliationRunId: runId,
        approvals: [],
        requiredApprovals: 1,
      };

      const changeSetMolecule = queryRunner.manager.create(Molecule, {
        moleculeId: moleculeIdStr,
        name: name || `Reconciliation: ${runId.substring(0, 8)}`,
        description: description || `Governed change set from reconciliation run ${runId}`,
        lensType: 'change_set',
        ownerId: 'reconciliation-agent',
        tags: ['reconciliation', 'governed'],
        metadata: {},
        changeSetMetadata,
      });

      const savedChangeSet = await queryRunner.manager.save(Molecule, changeSetMolecule);

      // 3. Create proposed atoms
      const tempIdToAtomId = new Map<string, string>();
      let atomCount = 0;

      for (const atomRec of atomsToApply) {
        // Generate atom ID
        const atomIdResult = await queryRunner.manager.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING("atomId" FROM 4) AS INTEGER)), 0) + 1 as next_id FROM atoms WHERE "atomId" LIKE 'IA-%'`,
        );
        const nextAtomId = atomIdResult[0]?.next_id || 1;
        const atomIdStr = `IA-${String(nextAtomId).padStart(3, '0')}`;

        const observableOutcomes = atomRec.observableOutcomes.map((o) => ({
          description: o.description,
          measurementCriteria: o.measurementCriteria,
        }));

        const atom = queryRunner.manager.create(Atom, {
          atomId: atomIdStr,
          description: atomRec.description,
          category: atomRec.category,
          qualityScore: atomRec.qualityScore || atomRec.confidence,
          status: 'proposed',
          changeSetId: savedChangeSet.id,
          observableOutcomes,
          metadata: {
            source: 'reconciliation',
            confidence: atomRec.confidence,
            reasoning: atomRec.reasoning,
            sourceTest: {
              filePath: atomRec.sourceTestFilePath,
              testName: atomRec.sourceTestName,
              lineNumber: atomRec.sourceTestLineNumber,
            },
            tempId: atomRec.tempId,
          },
        });

        const savedAtom = await queryRunner.manager.save(Atom, atom);
        tempIdToAtomId.set(atomRec.tempId, savedAtom.id);

        // Update recommendation
        await queryRunner.manager.update(
          AtomRecommendation,
          { id: atomRec.id },
          { atomId: savedAtom.id, status: 'accepted', acceptedAt: new Date() },
        );

        // Add atom to change set molecule
        const junction = queryRunner.manager.create(MoleculeAtom, {
          moleculeId: savedChangeSet.id,
          atomId: savedAtom.id,
          order: atomCount,
          addedBy: 'reconciliation-agent',
        });
        await queryRunner.manager.save(MoleculeAtom, junction);

        atomCount++;
      }

      // 4. Handle molecule recommendations (create normal molecules linking to proposed atoms)
      const moleculesToApply = selections
        ? moleculeRecs.filter((m) => selections.includes(m.id) || selections.includes(m.tempId))
        : moleculeRecs.filter((m) => m.status === 'pending');

      for (const moleculeRec of moleculesToApply) {
        const atomIds = moleculeRec.atomRecommendationTempIds
          .map((tempId) => tempIdToAtomId.get(tempId))
          .filter((id): id is string => id !== undefined);

        if (atomIds.length === 0) continue;

        await this.createMoleculeFromRecommendation(queryRunner, moleculeRec, atomIds);

        await queryRunner.manager.update(
          MoleculeRecommendation,
          { id: moleculeRec.id },
          { atomIds, status: 'accepted', acceptedAt: new Date() },
        );
      }

      await queryRunner.commitTransaction();

      this.logger.log(`Change set created: ${savedChangeSet.id} with ${atomCount} proposed atoms`);

      return {
        changeSetId: savedChangeSet.id,
        atomCount,
        moleculeId: moleculeIdStr,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Change set creation rolled back: ${errorMessage}`);
      throw new BadRequestException(`Failed to create change set: ${errorMessage}`);
    } finally {
      await queryRunner.release();
    }
  }
}
