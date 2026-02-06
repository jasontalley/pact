import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  Optional,
  Inject,
  forwardRef,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import {
  CommittedAtomGuard,
  AllowCommittedAtomOperation,
} from '../../common/guards/committed-atom.guard';
import { AtomsService } from './atoms.service';
import { CreateAtomDto } from './dto/create-atom.dto';
import { UpdateAtomDto } from './dto/update-atom.dto';
import { AtomSearchDto, PaginatedAtomsResponse } from './dto/atom-search.dto';
import { AnalyzeIntentDto } from './dto/analyze-intent.dto';
import { RefineAtomDto } from './dto/refine-atom.dto';
import { AcceptSuggestionDto } from './dto/accept-suggestion.dto';
import { SupersedeAtomDto, SupersessionResultDto } from './dto/supersede-atom.dto';
import { Atom, RefinementRecord } from './atom.entity';
import {
  IntentRefinementService,
  IntentAnalysisResult,
  RefinementSuggestion,
  RefinementResult,
} from '../agents/intent-refinement.service';
import { ValidatorsService } from '../validators/validators.service';
import { CreateValidatorDto } from '../validators/dto/create-validator.dto';
import { Validator } from '../validators/validator.entity';
import { MoleculesService } from '../molecules/molecules.service';
import { Molecule } from '../molecules/molecule.entity';
import { SemanticDiffService, SemanticDiff } from './semantic-diff.service';

@ApiTags('atoms')
@Controller('atoms')
@UseGuards(CommittedAtomGuard)
export class AtomsController {
  constructor(
    private readonly atomsService: AtomsService,
    @Optional() private readonly intentRefinementService?: IntentRefinementService,
    @Optional()
    @Inject(forwardRef(() => ValidatorsService))
    private readonly validatorsService?: ValidatorsService,
    @Optional()
    @Inject(forwardRef(() => MoleculesService))
    private readonly moleculesService?: MoleculesService,
    @Optional() private readonly semanticDiffService?: SemanticDiffService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new Intent Atom' })
  @ApiResponse({ status: 201, description: 'Atom created successfully', type: Atom })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  create(@Body() createAtomDto: CreateAtomDto): Promise<Atom> {
    return this.atomsService.create(createAtomDto);
  }

  @Post('propose')
  @ApiOperation({
    summary: 'Create a proposed atom within a governed change set',
    description:
      'Creates an atom with status "proposed" linked to a change set. Proposed atoms are mutable but must go through change set approval before being committed.',
  })
  @ApiResponse({ status: 201, description: 'Proposed atom created successfully', type: Atom })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  propose(@Body() body: CreateAtomDto & { changeSetId: string }): Promise<Atom> {
    const { changeSetId, ...createAtomDto } = body;
    return this.atomsService.propose(createAtomDto, changeSetId);
  }

  @Patch(':id/convert-to-draft')
  @ApiOperation({
    summary: 'Convert a proposed atom to draft',
    description:
      'Removes a proposed atom from governance, converting it back to a regular draft atom.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the proposed atom' })
  @ApiResponse({ status: 200, description: 'Atom converted to draft', type: Atom })
  @ApiResponse({ status: 400, description: 'Atom is not in proposed status' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  convertToDraft(@Param('id') id: string): Promise<Atom> {
    return this.atomsService.convertToDraft(id);
  }

  @Get()
  @ApiOperation({ summary: 'List all atoms with optional filtering and pagination' })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['all', 'main', 'proposed'],
    description: 'Filter by governance scope',
  })
  @ApiResponse({ status: 200, description: 'List of atoms' })
  findAll(@Query() searchDto: AtomSearchDto): Promise<PaginatedAtomsResponse<Atom>> {
    return this.atomsService.findAll(searchDto);
  }

  @Get('tags')
  @ApiOperation({ summary: 'Get popular tags with usage counts' })
  @ApiResponse({ status: 200, description: 'List of tags with counts' })
  getPopularTags(@Query('limit') limit?: string): Promise<Array<{ tag: string; count: number }>> {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 20;
    return this.atomsService.getPopularTags(parsedLimit);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get atom statistics' })
  @ApiResponse({ status: 200, description: 'Atom statistics' })
  getStatistics() {
    return this.atomsService.getStatistics();
  }

  // Phase 18: Agent-Suggested Atoms HITL Approval
  // NOTE: These routes MUST come before @Get(':id') to avoid route shadowing

  @Get('pending-review')
  @ApiOperation({
    summary: 'Get all proposed atoms pending HITL review',
    description: 'Returns proposed atoms created by agents that need human approval',
  })
  @ApiResponse({ status: 200, description: 'List of proposed atoms', type: [Atom] })
  getPendingReview(): Promise<Atom[]> {
    return this.atomsService.getPendingReview();
  }

  @Get('pending-review/count')
  @ApiOperation({
    summary: 'Get count of proposed atoms pending HITL review',
    description: 'Returns the number of proposed atoms awaiting human approval',
  })
  @ApiResponse({
    status: 200,
    description: 'Count of pending atoms',
    schema: { properties: { count: { type: 'number' } } },
  })
  async getPendingCount(): Promise<{ count: number }> {
    const count = await this.atomsService.getPendingCount();
    return { count };
  }

  @Patch(':id/approve')
  @ApiOperation({
    summary: 'Approve a proposed atom',
    description: 'HITL approval: promotes proposed atom to committed status',
  })
  @ApiParam({ name: 'id', description: 'UUID of the proposed atom' })
  @ApiBody({
    schema: {
      properties: {
        approvedBy: { type: 'string', example: 'user-123' },
        description: { type: 'string' },
        category: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['approvedBy'],
    },
  })
  @ApiResponse({ status: 200, description: 'Atom approved and committed', type: Atom })
  @ApiResponse({ status: 400, description: 'Atom is not in proposed status' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  approveProposedAtom(
    @Param('id') id: string,
    @Body()
    body: {
      approvedBy: string;
      description?: string;
      category?: string;
      tags?: string[];
    },
  ): Promise<Atom> {
    const { approvedBy, description, category, tags } = body;
    return this.atomsService.approveProposedAtom(id, approvedBy, {
      description,
      category,
      tags,
    });
  }

  @Patch(':id/reject')
  @ApiOperation({
    summary: 'Reject a proposed atom',
    description: 'HITL rejection: marks proposed atom as abandoned',
  })
  @ApiParam({ name: 'id', description: 'UUID of the proposed atom' })
  @ApiBody({
    schema: {
      properties: {
        rejectedBy: { type: 'string', example: 'user-123' },
        reason: { type: 'string', example: 'Duplicate of existing atom IA-042' },
      },
      required: ['rejectedBy', 'reason'],
    },
  })
  @ApiResponse({ status: 200, description: 'Atom rejected and marked as abandoned', type: Atom })
  @ApiResponse({ status: 400, description: 'Atom is not in proposed status' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  rejectProposedAtom(
    @Param('id') id: string,
    @Body() body: { rejectedBy: string; reason: string },
  ): Promise<Atom> {
    return this.atomsService.rejectProposedAtom(id, body.rejectedBy, body.reason);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single atom by ID' })
  @ApiParam({ name: 'id', description: 'UUID or atomId (e.g., IA-001)' })
  @ApiResponse({ status: 200, description: 'Atom found', type: Atom })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  findOne(@Param('id') id: string): Promise<Atom> {
    return this.atomsService.findOne(id);
  }

  @Get('intent/:intentIdentity')
  @ApiOperation({ summary: 'Get all versions of an intent by intentIdentity' })
  @ApiParam({ name: 'intentIdentity', description: 'Intent identity UUID' })
  @ApiResponse({ status: 200, description: 'All versions of the intent', type: [Atom] })
  findByIntentIdentity(@Param('intentIdentity') intentIdentity: string): Promise<Atom[]> {
    return this.atomsService.findByIntentIdentity(intentIdentity);
  }

  @Get(':id/supersession-chain')
  @ApiOperation({ summary: 'Get the supersession chain for an atom' })
  @ApiParam({ name: 'id', description: 'UUID or atomId of the starting atom' })
  @ApiResponse({ status: 200, description: 'Supersession chain', type: [Atom] })
  findSupersessionChain(@Param('id') id: string): Promise<Atom[]> {
    return this.atomsService.findSupersessionChain(id);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: "Get version history for a specific atom's intent" })
  @ApiParam({ name: 'id', description: 'UUID of the atom' })
  @ApiResponse({ status: 200, description: 'Version history' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  getVersionHistory(@Param('id') id: string) {
    return this.atomsService.getVersionHistory(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a draft atom' })
  @ApiParam({ name: 'id', description: 'UUID of the atom' })
  @ApiResponse({ status: 200, description: 'Atom updated successfully', type: Atom })
  @ApiResponse({ status: 403, description: 'Cannot update non-draft atom' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  update(@Param('id') id: string, @Body() updateAtomDto: UpdateAtomDto): Promise<Atom> {
    return this.atomsService.update(id, updateAtomDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a draft atom' })
  @ApiParam({ name: 'id', description: 'UUID of the atom' })
  @ApiResponse({ status: 204, description: 'Atom deleted successfully' })
  @ApiResponse({ status: 403, description: 'Cannot delete non-draft atom' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  remove(@Param('id') id: string): Promise<void> {
    return this.atomsService.remove(id);
  }

  @Patch(':id/commit')
  @ApiOperation({ summary: 'Commit an atom (make it immutable)' })
  @ApiParam({ name: 'id', description: 'UUID of the atom' })
  @ApiResponse({ status: 200, description: 'Atom committed successfully', type: Atom })
  @ApiResponse({ status: 400, description: 'Quality score too low or already committed' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  commit(@Param('id') id: string): Promise<Atom> {
    return this.atomsService.commit(id);
  }

  @Patch(':id/supersede')
  @AllowCommittedAtomOperation()
  @ApiOperation({ summary: 'Supersede an atom with an existing atom' })
  @ApiParam({ name: 'id', description: 'UUID of the atom to supersede' })
  @ApiBody({ schema: { properties: { newAtomId: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Atom superseded successfully', type: Atom })
  @ApiResponse({ status: 400, description: 'Already superseded' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  supersede(@Param('id') id: string, @Body('newAtomId') newAtomId: string): Promise<Atom> {
    return this.atomsService.supersede(id, newAtomId);
  }

  @Post(':id/supersede-with-new')
  @AllowCommittedAtomOperation()
  @ApiOperation({
    summary: 'Supersede an atom by creating a new version',
    description:
      'Creates a new atom with the provided description and marks the original as superseded. ' +
      'Use this to "fix" or "update" a committed atom. The original remains immutable.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the atom to supersede' })
  @ApiResponse({
    status: 201,
    description: 'Atom superseded and new version created',
    type: SupersessionResultDto,
  })
  @ApiResponse({ status: 400, description: 'Cannot supersede draft atom or already superseded' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  supersedeWithNewAtom(
    @Param('id') id: string,
    @Body() supersedeDto: SupersedeAtomDto,
  ): Promise<SupersessionResultDto> {
    return this.atomsService.supersedeWithNewAtom(id, supersedeDto);
  }

  @Post(':id/tags')
  @ApiOperation({ summary: 'Add a tag to an atom' })
  @ApiParam({ name: 'id', description: 'UUID of the atom' })
  @ApiBody({ schema: { properties: { tag: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Tag added successfully', type: Atom })
  @ApiResponse({ status: 403, description: 'Cannot modify non-draft atom' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  addTag(@Param('id') id: string, @Body('tag') tag: string): Promise<Atom> {
    return this.atomsService.addTag(id, tag);
  }

  @Delete(':id/tags/:tag')
  @ApiOperation({ summary: 'Remove a tag from an atom' })
  @ApiParam({ name: 'id', description: 'UUID of the atom' })
  @ApiParam({ name: 'tag', description: 'Tag to remove' })
  @ApiResponse({ status: 200, description: 'Tag removed successfully', type: Atom })
  @ApiResponse({ status: 403, description: 'Cannot modify non-draft atom' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  removeTag(@Param('id') id: string, @Param('tag') tag: string): Promise<Atom> {
    return this.atomsService.removeTag(id, tag);
  }

  // ========================
  // Validator Endpoints
  // ========================

  @Get(':id/validators')
  @ApiOperation({
    summary: 'Get validators for an atom',
    description: 'Returns all validators associated with the specified atom.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the atom' })
  @ApiResponse({
    status: 200,
    description: 'List of validators for the atom',
    type: [Validator],
  })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  async getValidators(@Param('id') id: string): Promise<Validator[]> {
    if (!this.validatorsService) {
      throw new Error('Validators service is not available');
    }
    return this.validatorsService.findByAtom(id);
  }

  @Post(':id/validators')
  @ApiOperation({
    summary: 'Create a validator for an atom',
    description:
      'Creates a new validator associated with the specified atom. This is a shorthand for POST /validators with the atomId pre-filled.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the atom' })
  @ApiResponse({
    status: 201,
    description: 'Validator created successfully',
    type: Validator,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  async createValidator(
    @Param('id') id: string,
    @Body() createValidatorDto: Omit<CreateValidatorDto, 'atomId'>,
  ): Promise<Validator> {
    if (!this.validatorsService) {
      throw new Error('Validators service is not available');
    }
    // Ensure the atom exists first
    await this.atomsService.findOne(id);
    // Create validator with the atom ID from the URL
    return this.validatorsService.create({
      ...createValidatorDto,
      atomId: id,
    } as CreateValidatorDto);
  }

  @Get(':id/validation-status')
  @ApiOperation({
    summary: 'Get validation status summary for an atom',
    description:
      'Returns a summary of all validators for the atom including counts by type and active/inactive status.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the atom' })
  @ApiResponse({
    status: 200,
    description: 'Validation status summary',
    schema: {
      type: 'object',
      properties: {
        atomId: { type: 'string' },
        totalValidators: { type: 'number' },
        activeValidators: { type: 'number' },
        inactiveValidators: { type: 'number' },
        byType: {
          type: 'object',
          properties: {
            gherkin: { type: 'number' },
            executable: { type: 'number' },
            declarative: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  async getValidationStatus(@Param('id') id: string) {
    if (!this.validatorsService) {
      throw new Error('Validators service is not available');
    }
    return this.validatorsService.getValidationStatus(id);
  }

  // ========================
  // Molecule Integration Endpoints
  // ========================

  @Get(':id/molecules')
  @ApiOperation({
    summary: 'Get molecules containing this atom',
    description: 'Returns all molecules (Views/Lenses) that contain the specified atom.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the atom' })
  @ApiResponse({
    status: 200,
    description: 'List of molecules containing the atom',
    type: [Molecule],
  })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  async getMolecules(@Param('id') id: string): Promise<Molecule[]> {
    if (!this.moleculesService) {
      throw new Error('Molecules service is not available');
    }
    // Ensure the atom exists first
    await this.atomsService.findOne(id);
    return this.moleculesService.getMoleculesForAtom(id);
  }

  // ========================
  // Refinement Endpoints
  // ========================

  @Post('analyze')
  @ApiOperation({
    summary: 'Analyze raw intent for atomicity',
    description:
      'Analyzes a raw intent description to determine if it represents an atomic behavioral primitive. Returns atomicity assessment, violations, and improvement suggestions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Intent analysis result',
    schema: {
      type: 'object',
      properties: {
        atomicity: { type: 'string', enum: ['atomic', 'non-atomic', 'ambiguous'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        violations: { type: 'array', items: { type: 'string' } },
        clarifyingQuestions: { type: 'array', items: { type: 'string' } },
        decompositionSuggestions: { type: 'array', items: { type: 'string' } },
        precisionImprovements: { type: 'array', items: { type: 'string' } },
        qualityPreview: {
          type: 'object',
          properties: {
            estimatedScore: { type: 'number' },
            decision: { type: 'string', enum: ['approve', 'revise', 'reject'] },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 503, description: 'Refinement service not available' })
  async analyzeIntent(@Body() analyzeIntentDto: AnalyzeIntentDto): Promise<IntentAnalysisResult> {
    if (!this.intentRefinementService) {
      throw new Error('Intent refinement service is not available');
    }
    return this.intentRefinementService.analyzeIntent(analyzeIntentDto.intent);
  }

  @Post(':id/suggest-refinements')
  @ApiOperation({
    summary: 'Get refinement suggestions for an atom',
    description:
      'Generates AI-powered suggestions for improving an atom description. Suggestions include clarifications, decompositions, and precision improvements.',
  })
  @ApiParam({ name: 'id', description: 'UUID or atomId of the atom' })
  @ApiResponse({
    status: 200,
    description: 'List of refinement suggestions',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: {
            type: 'string',
            enum: ['clarification', 'decomposition', 'precision', 'rewrite'],
          },
          original: { type: 'string' },
          suggested: { type: 'string' },
          reasoning: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  @ApiResponse({ status: 503, description: 'Refinement service not available' })
  async suggestRefinements(@Param('id') id: string): Promise<RefinementSuggestion[]> {
    if (!this.intentRefinementService) {
      throw new Error('Intent refinement service is not available');
    }
    const atom = await this.atomsService.findOne(id);
    return this.intentRefinementService.suggestRefinements(atom.description);
  }

  @Post(':id/refine')
  @ApiOperation({
    summary: 'Refine an atom with feedback',
    description:
      'Applies user feedback to refine an atom description. Records refinement history and re-evaluates quality score.',
  })
  @ApiParam({ name: 'id', description: 'UUID or atomId of the atom' })
  @ApiResponse({
    status: 200,
    description: 'Refinement applied successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        atom: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            atomId: { type: 'string' },
            description: { type: 'string' },
            qualityScore: { type: 'number', nullable: true },
          },
        },
        previousDescription: { type: 'string' },
        refinementRecord: { type: 'object' },
        newQualityScore: { type: 'number' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Cannot refine non-draft atom' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  @ApiResponse({ status: 503, description: 'Refinement service not available' })
  async refineAtom(
    @Param('id') id: string,
    @Body() refineAtomDto: RefineAtomDto,
  ): Promise<RefinementResult> {
    if (!this.intentRefinementService) {
      throw new Error('Intent refinement service is not available');
    }
    return this.intentRefinementService.refineAtom(id, refineAtomDto.feedback);
  }

  @Get(':id/refinement-history')
  @ApiOperation({
    summary: 'Get refinement history for an atom',
    description:
      'Returns the complete refinement history showing how the atom description evolved over time.',
  })
  @ApiParam({ name: 'id', description: 'UUID or atomId of the atom' })
  @ApiResponse({
    status: 200,
    description: 'Refinement history',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          timestamp: { type: 'string', format: 'date-time' },
          previousDescription: { type: 'string' },
          newDescription: { type: 'string' },
          feedback: { type: 'string' },
          source: { type: 'string', enum: ['ai-assisted', 'heuristic', 'manual'] },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  @ApiResponse({ status: 503, description: 'Refinement service not available' })
  async getRefinementHistory(@Param('id') id: string): Promise<RefinementRecord[]> {
    if (!this.intentRefinementService) {
      throw new Error('Intent refinement service is not available');
    }
    return this.intentRefinementService.getRefinementHistory(id);
  }

  @Post(':id/accept-suggestion')
  @ApiOperation({
    summary: 'Accept and apply a refinement suggestion',
    description: 'Accepts a specific refinement suggestion and applies it to the atom.',
  })
  @ApiParam({ name: 'id', description: 'UUID or atomId of the atom' })
  @ApiResponse({
    status: 200,
    description: 'Suggestion applied successfully',
  })
  @ApiResponse({ status: 400, description: 'Cannot refine non-draft atom' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  @ApiResponse({ status: 503, description: 'Refinement service not available' })
  async acceptSuggestion(
    @Param('id') id: string,
    @Body() acceptSuggestionDto: AcceptSuggestionDto,
  ): Promise<RefinementResult> {
    if (!this.intentRefinementService) {
      throw new Error('Intent refinement service is not available');
    }
    return this.intentRefinementService.acceptSuggestion(id, acceptSuggestionDto);
  }

  // ===========================================================================
  // Semantic Diffing (Phase 12.4)
  // ===========================================================================

  @Get(':id/diff/:compareId')
  @ApiOperation({
    summary: 'Compare two atoms semantically',
    description:
      'Get a semantic diff between two atoms, analyzing changes in description, outcomes, criteria, and quality.',
  })
  @ApiParam({ name: 'id', description: 'UUID or atomId of the first atom' })
  @ApiParam({ name: 'compareId', description: 'UUID or atomId of the second atom' })
  @ApiResponse({ status: 200, description: 'Semantic diff result' })
  @ApiResponse({ status: 404, description: 'One or both atoms not found' })
  async diffAtoms(
    @Param('id') id: string,
    @Param('compareId') compareId: string,
  ): Promise<SemanticDiff> {
    if (!this.semanticDiffService) {
      throw new Error('Semantic diff service is not available');
    }
    return this.semanticDiffService.diff(id, compareId);
  }
}
