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

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ReconciliationRepository } from './repositories/reconciliation.repository';
import { AtomRecommendation } from './entities/atom-recommendation.entity';
import { MoleculeRecommendation } from './entities/molecule-recommendation.entity';
import { Atom } from '../atoms/atom.entity';
import { Molecule } from '../molecules/molecule.entity';
import { MoleculeAtom } from '../molecules/molecule-atom.entity';

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

  constructor(
    private readonly dataSource: DataSource,
    private readonly repository: ReconciliationRepository,
  ) {}

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
            'atom_recommendation',
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
            this.logger.warn(
              `Skipping molecule ${moleculeRec.id} - no valid atom IDs found`,
            );
            continue;
          }

          const molecule = await this.createMoleculeFromRecommendation(
            queryRunner,
            moleculeRec,
            atomIds,
          );

          // Update recommendation with created molecule ID
          await queryRunner.manager.update(
            'molecule_recommendation',
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
      this.logger.log(`Transaction committed: ${atomsCreated} atoms, ${moleculesCreated} molecules`);
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
          await this.injectAtomAnnotation(mod);
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
      `SELECT COALESCE(MAX(CAST(SUBSTRING(atom_id FROM 4) AS INTEGER)), 0) + 1 as next_id FROM atoms WHERE atom_id LIKE 'IA-%'`,
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
      `SELECT COALESCE(MAX(CAST(SUBSTRING(molecule_id FROM 3) AS INTEGER)), 0) + 1 as next_id FROM molecules WHERE molecule_id LIKE 'M-%'`,
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
   */
  private async injectAtomAnnotation(mod: FileModification): Promise<void> {
    const { filePath, atomId, lineNumber } = mod;

    // Check file exists
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read file
    const content = await fs.readFile(filePath, 'utf-8');
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

    // Insert annotation comment
    const annotation = `${indent}// @atom ${atomId}`;
    lines.splice(targetLine, 0, annotation);

    // Write back
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    this.logger.log(`Injected @atom ${atomId} annotation in ${filePath}:${lineNumber}`);
  }
}
