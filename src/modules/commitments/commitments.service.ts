import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  CommitmentArtifact,
  CanonicalAtomSnapshot,
  StoredInvariantCheckResult,
} from './commitment.entity';
import { Atom } from '../atoms/atom.entity';
import { CreateCommitmentDto } from './dto/create-commitment.dto';
import { SupersedeCommitmentDto } from './dto/supersede-commitment.dto';
import { CommitmentSearchDto, PaginatedCommitmentsResponse } from './dto/commitment-search.dto';
import { CommitmentPreviewDto } from './dto/commitment-preview.dto';
import { AtomSummaryDto } from './dto/commitment-response.dto';
import { InvariantCheckResultDto } from '../invariants/dto/invariant-check-result.dto';
import { InvariantCheckingService } from '../invariants/invariant-checking.service';
import { CheckContext } from '../invariants/checkers/interfaces';

/**
 * Service for managing Commitments
 *
 * Enforces key invariants:
 * - INV-001: Explicit human commitment action required
 * - INV-004: Committed content is immutable
 * - INV-006: Only humans may authorize commitment
 */
@Injectable()
export class CommitmentsService {
  private readonly logger = new Logger(CommitmentsService.name);

  constructor(
    @InjectRepository(CommitmentArtifact)
    private readonly commitmentRepository: Repository<CommitmentArtifact>,
    @InjectRepository(Atom)
    private readonly atomRepository: Repository<Atom>,
    @Optional()
    private readonly invariantCheckingService?: InvariantCheckingService,
  ) {}

  /**
   * Generate the next commitment ID in sequence (COM-001, COM-002, etc.)
   */
  private async generateCommitmentId(): Promise<string> {
    const latestCommitment = await this.commitmentRepository.findOne({
      where: {},
      order: { commitmentId: 'DESC' },
    });

    const nextId = latestCommitment
      ? Number.parseInt(latestCommitment.commitmentId.split('-')[1], 10) + 1
      : 1;
    return `COM-${String(nextId).padStart(3, '0')}`;
  }

  /**
   * Create a canonical snapshot of atoms for immutable storage
   */
  private createCanonicalSnapshot(atoms: Atom[]): CanonicalAtomSnapshot[] {
    return atoms.map((atom) => ({
      atomId: atom.atomId,
      description: atom.description,
      category: atom.category,
      qualityScore: atom.qualityScore,
      observableOutcomes: atom.observableOutcomes,
      falsifiabilityCriteria: atom.falsifiabilityCriteria,
      tags: atom.tags,
    }));
  }

  /**
   * Convert atoms to summary DTOs
   */
  private toAtomSummaries(atoms: Atom[]): AtomSummaryDto[] {
    return atoms.map((atom) => ({
      id: atom.id,
      atomId: atom.atomId,
      description: atom.description,
      category: atom.category,
      qualityScore: atom.qualityScore,
    }));
  }

  /**
   * Run invariant checks using the InvariantCheckingService
   * Falls back to basic checks if service not available (for testing)
   */
  private async runInvariantChecks(
    atoms: Atom[],
    committedBy: string,
    projectId?: string,
    isPreview: boolean = true,
  ): Promise<InvariantCheckResultDto[]> {
    // Use InvariantCheckingService if available
    if (this.invariantCheckingService) {
      const context: CheckContext = {
        committedBy,
        projectId,
        isPreview,
      };

      const aggregatedResults = await this.invariantCheckingService.checkAll(atoms, context);

      return this.invariantCheckingService.toResultDtos(aggregatedResults.results);
    }

    // Fallback to basic checks for backward compatibility (mainly for testing)
    return this.runBasicInvariantChecks(atoms, committedBy);
  }

  /**
   * Basic invariant checks fallback (used when InvariantCheckingService not available)
   */
  private runBasicInvariantChecks(atoms: Atom[], committedBy: string): InvariantCheckResultDto[] {
    const results: InvariantCheckResultDto[] = [];

    // INV-001: Explicit Commitment Required
    results.push({
      invariantId: 'INV-001',
      name: 'Explicit Commitment Required',
      passed: !!committedBy && committedBy.trim().length > 0,
      severity: 'error',
      message: committedBy
        ? 'Commitment has explicit human identifier'
        : 'Missing committedBy identifier',
      affectedAtomIds: [],
      suggestions: committedBy ? [] : ['Provide a committedBy identifier'],
    });

    // INV-002: Behavioral Testability (check quality scores)
    const lowQualityAtoms = atoms.filter((a) => a.qualityScore !== null && a.qualityScore < 60);
    results.push({
      invariantId: 'INV-002',
      name: 'Intent Atoms Must Be Behaviorally Testable',
      passed: lowQualityAtoms.length === 0,
      severity: 'error',
      message:
        lowQualityAtoms.length === 0
          ? 'All atoms meet quality threshold'
          : `${lowQualityAtoms.length} atom(s) have quality score below 60`,
      affectedAtomIds: lowQualityAtoms.map((a) => a.id),
      suggestions: lowQualityAtoms.map(
        (a) => `Improve atom ${a.atomId} quality score (currently ${a.qualityScore})`,
      ),
    });

    // INV-004: Immutability Check (atoms must be in draft status)
    const nonDraftAtoms = atoms.filter((a) => a.status !== 'draft');
    results.push({
      invariantId: 'INV-004',
      name: 'Commitment Is Immutable',
      passed: nonDraftAtoms.length === 0,
      severity: 'error',
      message:
        nonDraftAtoms.length === 0
          ? 'All atoms are in draft status'
          : `${nonDraftAtoms.length} atom(s) are already committed`,
      affectedAtomIds: nonDraftAtoms.map((a) => a.id),
      suggestions: nonDraftAtoms.map(
        (a) => `Atom ${a.atomId} is already ${a.status}. Create new atoms or supersede.`,
      ),
    });

    // INV-006: Human Commit Check
    const isAgent =
      committedBy?.toLowerCase().includes('agent') ||
      committedBy?.toLowerCase().includes('bot') ||
      committedBy?.toLowerCase().includes('system');
    results.push({
      invariantId: 'INV-006',
      name: 'Agents May Not Commit Intent',
      passed: !isAgent,
      severity: 'error',
      message: isAgent
        ? 'Commitment appears to be from an agent, not a human'
        : 'Commitment authorized by human identifier',
      affectedAtomIds: [],
      suggestions: isAgent ? ['Commitment must be authorized by a human, not an agent'] : [],
    });

    return results;
  }

  /**
   * Preview a commitment without actually creating it
   */
  async preview(dto: CreateCommitmentDto): Promise<CommitmentPreviewDto> {
    // Fetch atoms
    const atoms = await this.atomRepository.find({
      where: { id: In(dto.atomIds) },
    });

    // Check all requested atoms exist
    if (atoms.length !== dto.atomIds.length) {
      const foundIds = new Set(atoms.map((a) => a.id));
      const missingIds = dto.atomIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`Atoms not found: ${missingIds.join(', ')}`);
    }

    // Run invariant checks
    const invariantChecks = await this.runInvariantChecks(
      atoms,
      dto.committedBy,
      dto.projectId,
      true, // isPreview
    );

    const blockingIssues = invariantChecks
      .filter((c) => !c.passed && c.severity === 'error')
      .map((c) => c.message);

    const warnings = invariantChecks
      .filter((c) => !c.passed && c.severity === 'warning')
      .map((c) => c.message);

    return {
      canCommit: blockingIssues.length === 0,
      hasBlockingIssues: blockingIssues.length > 0,
      hasWarnings: warnings.length > 0,
      atoms: this.toAtomSummaries(atoms),
      invariantChecks,
      atomCount: atoms.length,
      blockingIssues: blockingIssues.length > 0 ? blockingIssues : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Create a new commitment
   */
  async create(dto: CreateCommitmentDto): Promise<CommitmentArtifact> {
    // Run preview to check for issues
    const preview = await this.preview(dto);

    // Block if there are blocking issues (unless all are overridable)
    if (preview.hasBlockingIssues && !dto.overrideJustification) {
      throw new BadRequestException(`Cannot commit: ${preview.blockingIssues?.join('; ')}`);
    }

    // Fetch atoms again for saving
    const atoms = await this.atomRepository.find({
      where: { id: In(dto.atomIds) },
    });

    // Generate commitment ID
    const commitmentId = await this.generateCommitmentId();

    // Create canonical snapshot
    const canonicalJson = this.createCanonicalSnapshot(atoms);

    // Convert check results for storage
    const storedChecks: StoredInvariantCheckResult[] = preview.invariantChecks.map(
      (check: InvariantCheckResultDto) => ({
        invariantId: check.invariantId,
        name: check.name,
        passed: check.passed,
        severity: check.severity,
        message: check.message,
        checkedAt: new Date(),
      }),
    );

    // Create commitment
    const commitment = this.commitmentRepository.create({
      commitmentId,
      projectId: dto.projectId ?? null,
      moleculeId: dto.moleculeId ?? null,
      canonicalJson,
      committedBy: dto.committedBy,
      invariantChecks: storedChecks,
      overrideJustification: dto.overrideJustification ?? null,
      status: 'active',
      atoms,
    });

    const savedCommitment = await this.commitmentRepository.save(commitment);

    // Update atom statuses to 'committed'
    await this.atomRepository.update(
      { id: In(dto.atomIds) },
      {
        status: 'committed',
        committedAt: new Date(),
      },
    );

    this.logger.log(
      `Created commitment ${commitmentId} with ${atoms.length} atoms by ${dto.committedBy}`,
    );

    return savedCommitment;
  }

  /**
   * Find all commitments with pagination and filtering
   */
  async findAll(query: CommitmentSearchDto): Promise<PaginatedCommitmentsResponse> {
    const { page = 1, limit = 20, projectId, moleculeId, status, committedBy } = query;

    const queryBuilder = this.commitmentRepository.createQueryBuilder('commitment');

    if (projectId) {
      queryBuilder.andWhere('commitment.projectId = :projectId', { projectId });
    }
    if (moleculeId) {
      queryBuilder.andWhere('commitment.moleculeId = :moleculeId', { moleculeId });
    }
    if (status) {
      queryBuilder.andWhere('commitment.status = :status', { status });
    }
    if (committedBy) {
      queryBuilder.andWhere('commitment.committedBy = :committedBy', { committedBy });
    }

    const [items, total] = await queryBuilder
      .orderBy('commitment.committedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Find a single commitment by ID
   */
  async findOne(id: string): Promise<CommitmentArtifact> {
    const commitment = await this.commitmentRepository.findOne({
      where: { id },
      relations: ['atoms'],
    });

    if (!commitment) {
      throw new NotFoundException(`Commitment with ID ${id} not found`);
    }

    return commitment;
  }

  /**
   * Find a commitment by commitmentId (e.g., "COM-001")
   */
  async findByCommitmentId(commitmentId: string): Promise<CommitmentArtifact> {
    const commitment = await this.commitmentRepository.findOne({
      where: { commitmentId },
      relations: ['atoms'],
    });

    if (!commitment) {
      throw new NotFoundException(`Commitment ${commitmentId} not found`);
    }

    return commitment;
  }

  /**
   * Supersede an existing commitment with a new one
   */
  async supersede(id: string, dto: SupersedeCommitmentDto): Promise<CommitmentArtifact> {
    const original = await this.findOne(id);

    if (original.status === 'superseded') {
      throw new BadRequestException(`Commitment ${original.commitmentId} is already superseded`);
    }

    // Create the new commitment
    const newCommitment = await this.create({
      atomIds: dto.atomIds,
      committedBy: dto.committedBy,
      projectId: original.projectId ?? undefined,
      moleculeId: original.moleculeId ?? undefined,
      overrideJustification: dto.overrideJustification,
    });

    // Update the new commitment to reference the superseded one
    newCommitment.supersedes = original.id;
    newCommitment.metadata = {
      ...newCommitment.metadata,
      supersessionReason: dto.reason,
    };
    await this.commitmentRepository.save(newCommitment);

    // Mark original as superseded
    original.status = 'superseded';
    original.supersededBy = newCommitment.id;
    await this.commitmentRepository.save(original);

    this.logger.log(
      `Commitment ${original.commitmentId} superseded by ${newCommitment.commitmentId}`,
    );

    return newCommitment;
  }

  /**
   * Get the supersession history chain for a commitment
   */
  async getHistory(id: string): Promise<CommitmentArtifact[]> {
    const commitment = await this.findOne(id);
    const history: CommitmentArtifact[] = [];

    // Walk backwards to find original
    let current: CommitmentArtifact | null = commitment;
    const visited = new Set<string>();

    while (current?.supersedes && !visited.has(current.id)) {
      visited.add(current.id);
      const previous = await this.commitmentRepository.findOne({
        where: { id: current.supersedes },
      });
      if (previous) {
        history.unshift(previous);
        current = previous;
      } else {
        break;
      }
    }

    // Add current commitment
    history.push(commitment);

    // Walk forward to find latest
    current = commitment;
    visited.clear();
    while (current?.supersededBy && !visited.has(current.id)) {
      visited.add(current.id);
      const next = await this.commitmentRepository.findOne({
        where: { id: current.supersededBy },
      });
      if (next) {
        history.push(next);
        current = next;
      } else {
        break;
      }
    }

    return history;
  }

  /**
   * Get atoms from a commitment
   */
  async getAtoms(id: string): Promise<Atom[]> {
    const commitment = await this.findOne(id);
    return commitment.atoms;
  }
}
