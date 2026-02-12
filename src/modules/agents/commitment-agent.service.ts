import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Atom } from '../atoms/atom.entity';
import { AgentAction } from './agent-action.entity';
import { AtomizationService } from './atomization.service';
import { IntentRefinementService } from './intent-refinement.service';
import { CommitmentsService } from '../commitments/commitments.service';
import { InvariantCheckingService } from '../invariants/invariant-checking.service';
import { CommitmentArtifact } from '../commitments/commitment.entity';
import { CommitmentPreviewDto } from '../commitments/dto/commitment-preview.dto';
import { CheckContext } from '../invariants/checkers/interfaces';
import { LLMService } from '../../common/llm/llm.service';
import { parseJsonWithRecovery } from '../../common/llm/json-recovery';

/**
 * DTO for proposing atoms from molecular intent
 */
export interface ProposeAtomsDto {
  /** High-level feature or capability description */
  molecularIntent: string;
  /** Category for the atoms */
  category?: string;
  /** User making the request */
  requestedBy: string;
  /** Project ID for context */
  projectId?: string;
}

/**
 * DTO for atom proposal result
 */
export interface AtomProposalResult {
  success: boolean;
  proposedAtoms: ProposedAtom[];
  analysis: string;
  suggestions?: string[];
  confidence: number;
}

/**
 * A proposed atom before commitment
 */
export interface ProposedAtom {
  tempId: string;
  description: string;
  category: string;
  qualityScore?: number;
  qualityFeedback?: string;
  observableOutcomes?: Array<{ description: string }>;
  falsifiabilityCriteria?: Array<{ condition: string; expectedBehavior: string }>;
}

/**
 * DTO for commitment preparation result
 */
export interface CommitmentPreparationResult {
  canCommit: boolean;
  atomIds: string[];
  preview: CommitmentPreviewDto;
  summary: string;
  issues?: string[];
  warnings?: string[];
}

/**
 * DTO for executing a commitment
 */
export interface ExecuteCommitmentDto {
  atomIds: string[];
  committedBy: string;
  humanApproval: boolean;
  projectId?: string;
  moleculeId?: string;
  overrideJustification?: string;
}

/**
 * Service for agent-driven commitment flow
 *
 * This service orchestrates the chat-based commitment flow:
 * 1. User describes molecular intent (feature/capability)
 * 2. Agent proposes atoms based on analysis
 * 3. User reviews and refines atoms
 * 4. Agent prepares commitment with invariant preview
 * 5. User provides explicit approval
 * 6. Commitment is executed
 */
@Injectable()
export class CommitmentAgentService {
  private readonly logger = new Logger(CommitmentAgentService.name);

  constructor(
    @InjectRepository(Atom)
    private readonly atomRepository: Repository<Atom>,
    @InjectRepository(AgentAction)
    private readonly agentActionRepository: Repository<AgentAction>,
    private readonly configService: ConfigService,
    private readonly llmService: LLMService,
    private readonly atomizationService: AtomizationService,
    private readonly intentRefinementService: IntentRefinementService,
    private readonly commitmentsService: CommitmentsService,
    private readonly invariantCheckingService: InvariantCheckingService,
  ) {}

  /**
   * Propose atoms from a molecular intent description
   *
   * Takes a high-level feature description and breaks it down into
   * individual atomic intents that can be committed.
   */
  async proposeAtomsFromIntent(dto: ProposeAtomsDto): Promise<AtomProposalResult> {
    this.logger.log(`Analyzing molecular intent: "${dto.molecularIntent.substring(0, 100)}..."`);

    // Log agent action start
    const actionId = await this.logAgentAction('propose_atoms', dto, { status: 'started' });

    try {
      // Use LLM to decompose molecular intent into atomic intents
      const decomposition = await this.decomposeMolecularIntent(dto.molecularIntent, dto.category);

      if (!decomposition.success) {
        await this.updateAgentAction(actionId, {
          status: 'failed',
          result: decomposition,
        });

        return {
          success: false,
          proposedAtoms: [],
          analysis: decomposition.analysis,
          suggestions: decomposition.suggestions,
          confidence: decomposition.confidence,
        };
      }

      // Create proposed atoms with quality validation
      const proposedAtoms: ProposedAtom[] = [];
      for (let i = 0; i < decomposition.atomicIntents.length; i++) {
        const intent = decomposition.atomicIntents[i];
        const tempId = `TEMP-${i + 1}`;

        // Validate quality for each proposed atom
        const atomizationResult = await this.atomizationService.atomize({
          intentDescription: intent.description,
          category: intent.category || dto.category,
          createdBy: dto.requestedBy,
        });

        proposedAtoms.push({
          tempId,
          description: intent.description,
          category: intent.category || dto.category || 'functional',
          qualityScore: atomizationResult.qualityValidation?.totalScore,
          qualityFeedback: atomizationResult.qualityValidation?.overallFeedback,
          observableOutcomes: intent.observableOutcomes,
          falsifiabilityCriteria: intent.falsifiabilityCriteria,
        });
      }

      await this.updateAgentAction(actionId, {
        status: 'completed',
        result: { proposedCount: proposedAtoms.length },
      });

      return {
        success: true,
        proposedAtoms,
        analysis: decomposition.analysis,
        suggestions: decomposition.suggestions,
        confidence: decomposition.confidence,
      };
    } catch (error) {
      this.logger.error(`Failed to propose atoms: ${error}`);
      await this.updateAgentAction(actionId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Review and refine proposed atoms based on user feedback
   */
  async reviewAndRefine(atoms: Atom[], feedback: string, _requestedBy: string): Promise<Atom[]> {
    this.logger.log(`Refining ${atoms.length} atoms based on feedback`);

    const refinedAtoms: Atom[] = [];

    for (const atom of atoms) {
      try {
        const refinementResult = await this.intentRefinementService.refineAtom(atom.id, feedback);

        if (refinementResult.success && refinementResult.atom) {
          // Fetch the updated atom from repository
          const updatedAtom = await this.atomRepository.findOne({
            where: { id: refinementResult.atom.id },
          });
          if (updatedAtom) {
            refinedAtoms.push(updatedAtom);
          } else {
            refinedAtoms.push(atom);
          }
        } else {
          // Keep original if refinement failed
          refinedAtoms.push(atom);
        }
      } catch (error) {
        this.logger.warn(`Failed to refine atom ${atom.atomId}: ${error.message}`);
        refinedAtoms.push(atom);
      }
    }

    return refinedAtoms;
  }

  /**
   * Prepare a commitment by running invariant checks and generating summary
   */
  async prepareCommitment(
    atomIds: string[],
    committedBy: string,
    projectId?: string,
  ): Promise<CommitmentPreparationResult> {
    this.logger.log(`Preparing commitment for ${atomIds.length} atoms`);

    // Get atoms
    const atoms = await this.atomRepository.findByIds(atomIds);
    if (atoms.length !== atomIds.length) {
      const foundIds = new Set(atoms.map((a) => a.id));
      const missingIds = atomIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`Atoms not found: ${missingIds.join(', ')}`);
    }

    // Run commitment preview
    const preview = await this.commitmentsService.preview({
      atomIds,
      committedBy,
      projectId,
    });

    // Generate summary
    const summary = await this.generateCommitmentSummary(atoms, preview);

    return {
      canCommit: preview.canCommit,
      atomIds,
      preview,
      summary,
      issues: preview.blockingIssues,
      warnings: preview.warnings,
    };
  }

  /**
   * Execute a commitment after human approval
   *
   * This enforces INV-006: Only humans may authorize commitment
   */
  async executeCommitment(dto: ExecuteCommitmentDto): Promise<CommitmentArtifact> {
    this.logger.log(`Executing commitment for ${dto.atomIds.length} atoms`);

    // Verify human approval (INV-006)
    if (!dto.humanApproval) {
      throw new BadRequestException('Human approval is required to execute commitment (INV-006)');
    }

    // Verify committedBy looks like a human
    const context: CheckContext = {
      committedBy: dto.committedBy,
      projectId: dto.projectId,
      isPreview: false,
    };

    // Get atoms for checking
    const atoms = await this.atomRepository.findByIds(dto.atomIds);

    // Run INV-006 check explicitly
    const checkResult = await this.invariantCheckingService.checkSingle(atoms, 'INV-006', context);

    if (checkResult && !checkResult.passed) {
      throw new BadRequestException(`Cannot execute commitment: ${checkResult.message}`);
    }

    // Log the commitment action
    const actionId = await this.logAgentAction('execute_commitment', dto, {
      status: 'started',
      humanApproval: true,
    });

    try {
      // Execute the commitment
      const commitment = await this.commitmentsService.create({
        atomIds: dto.atomIds,
        committedBy: dto.committedBy,
        projectId: dto.projectId,
        moleculeId: dto.moleculeId,
        overrideJustification: dto.overrideJustification,
      });

      await this.updateAgentAction(actionId, {
        status: 'completed',
        commitmentId: commitment.commitmentId,
      });

      this.logger.log(`Commitment ${commitment.commitmentId} created successfully`);

      return commitment;
    } catch (error) {
      await this.updateAgentAction(actionId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Decompose molecular intent into atomic intents using LLM
   */
  private async decomposeMolecularIntent(
    molecularIntent: string,
    category?: string,
  ): Promise<{
    success: boolean;
    atomicIntents: Array<{
      description: string;
      category?: string;
      observableOutcomes?: Array<{ description: string }>;
      falsifiabilityCriteria?: Array<{ condition: string; expectedBehavior: string }>;
    }>;
    analysis: string;
    suggestions?: string[];
    confidence: number;
  }> {
    const prompt = `You are an expert at decomposing high-level feature descriptions into atomic, testable intent statements.

Given the following molecular intent (feature/capability description):
"${molecularIntent}"
${category ? `Category: ${category}` : ''}

Decompose this into individual atomic intents. Each atomic intent should:
1. Describe a single, indivisible behavior
2. Be observable and falsifiable (testable)
3. Be implementation-agnostic (describe WHAT, not HOW)
4. Use clear, unambiguous language

For each atomic intent, provide:
- A clear description
- At least one observable outcome
- At least one falsifiability criterion

Respond in JSON format:
{
  "success": true/false,
  "atomicIntents": [
    {
      "description": "...",
      "category": "functional|performance|security|reliability|usability|maintainability",
      "observableOutcomes": [{"description": "..."}],
      "falsifiabilityCriteria": [{"condition": "...", "expectedBehavior": "..."}]
    }
  ],
  "analysis": "Brief analysis of the decomposition",
  "suggestions": ["Any suggestions for improvement"],
  "confidence": 0.0-1.0
}`;

    try {
      const response = await this.llmService.invoke({
        messages: [
          {
            role: 'system',
            content:
              'You are an expert intent decomposition assistant for Pact, a system for capturing product intent.',
          },
          { role: 'user', content: prompt },
        ],
        agentName: 'commitment-agent',
        purpose: 'Decompose molecular intent into atomic intents',
        temperature: 0.3,
      });

      // Extract JSON from response (handles markdown fences, trailing commas, etc.)
      const result = parseJsonWithRecovery(response.content);
      if (!result || Array.isArray(result)) {
        throw new Error('No JSON found in LLM response');
      }
      return result as unknown as { success: boolean; atomicIntents: Array<{ description: string; category?: string; observableOutcomes?: Array<{ description: string }>; falsifiabilityCriteria?: Array<{ condition: string; expectedBehavior: string }> }>; analysis: string; suggestions?: string[]; confidence: number };
    } catch (error) {
      this.logger.error(`Failed to decompose molecular intent: ${error}`);
      return {
        success: false,
        atomicIntents: [],
        analysis: 'Failed to analyze the molecular intent',
        suggestions: ['Try breaking down the feature into smaller parts manually'],
        confidence: 0,
      };
    }
  }

  /**
   * Generate a human-readable commitment summary
   */
  private async generateCommitmentSummary(
    atoms: Atom[],
    preview: CommitmentPreviewDto,
  ): Promise<string> {
    const parts: string[] = [];

    parts.push(`Commitment Summary:`);
    parts.push(`- ${atoms.length} atom(s) to be committed`);
    parts.push(`- Categories: ${[...new Set(atoms.map((a) => a.category))].join(', ')}`);

    if (preview.canCommit) {
      parts.push(`\n✓ All invariant checks passed. Ready to commit.`);
    } else {
      parts.push(`\n✗ Cannot commit due to invariant violations:`);
      preview.blockingIssues?.forEach((issue) => {
        parts.push(`  - ${issue}`);
      });
    }

    if (preview.warnings && preview.warnings.length > 0) {
      parts.push(`\nWarnings:`);
      preview.warnings.forEach((warning) => {
        parts.push(`  - ${warning}`);
      });
    }

    parts.push(`\nAtoms:`);
    atoms.forEach((atom, index) => {
      parts.push(`  ${index + 1}. [${atom.atomId}] ${atom.description.substring(0, 80)}...`);
      if (atom.qualityScore) {
        parts.push(`     Quality: ${atom.qualityScore}/100`);
      }
    });

    return parts.join('\n');
  }

  /**
   * Log an agent action
   */
  private async logAgentAction(
    actionType: string,
    input: unknown,
    metadata: Record<string, unknown>,
  ): Promise<string> {
    const action = this.agentActionRepository.create({
      agentName: 'commitment-agent',
      actionType,
      input: input as Record<string, any>,
      metadata: metadata as Record<string, any>,
    });

    const saved = await this.agentActionRepository.save(action);
    return saved.id;
  }

  /**
   * Update an agent action
   */
  private async updateAgentAction(
    actionId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    await this.agentActionRepository.update(actionId, {
      metadata: updates as Record<string, any>,
    });
  }
}
