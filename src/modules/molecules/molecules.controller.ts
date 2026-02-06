import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MoleculesService } from './molecules.service';
import { Molecule } from './molecule.entity';
import { MoleculeAtom } from './molecule-atom.entity';
import { Atom } from '../atoms/atom.entity';
import {
  CreateMoleculeDto,
  UpdateMoleculeDto,
  MoleculeSearchDto,
  AddAtomToMoleculeDto,
  BatchAddAtomsDto,
  ReorderAtomsDto,
  BatchUpdateAtomsDto,
  GetAtomsQueryDto,
  MoleculeResponseDto,
  MoleculeListResponseDto,
  MoleculeMetricsDto,
  MoleculeStatisticsDto,
  LensTypeInfoDto,
} from './dto';

@ApiTags('molecules')
@Controller('molecules')
export class MoleculesController {
  constructor(private readonly moleculesService: MoleculesService) {}

  // ========================================
  // Molecule CRUD
  // ========================================

  @Post()
  @ApiOperation({
    summary: 'Create a new molecule',
    description: 'Creates a new molecule (View/Lens) for organizing Intent Atoms.',
  })
  @ApiResponse({ status: 201, description: 'Molecule created successfully', type: Molecule })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Parent molecule not found' })
  async create(@Body() dto: CreateMoleculeDto): Promise<Molecule> {
    // TODO: Get userId from auth context
    const userId = 'system';
    return this.moleculesService.create(dto, userId);
  }

  @Get()
  @ApiOperation({
    summary: 'List molecules with filtering and pagination',
    description: 'Returns a paginated list of molecules with optional filters.',
  })
  @ApiResponse({ status: 200, description: 'List of molecules', type: MoleculeListResponseDto })
  async findAll(@Query() query: MoleculeSearchDto): Promise<MoleculeListResponseDto> {
    const result = await this.moleculesService.findAll(query);

    // Optionally compute metrics for each molecule (expensive - consider caching)
    const items = await Promise.all(
      result.items.map(async (molecule) => {
        const metrics = await this.moleculesService.getMetrics(molecule.id);
        return MoleculeResponseDto.fromEntity(molecule, metrics);
      }),
    );

    return {
      items,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      nextCursor: result.nextCursor,
    };
  }

  @Get('lens-types')
  @ApiOperation({
    summary: 'Get available lens types',
    description: 'Returns all available lens types with their labels and descriptions.',
  })
  @ApiResponse({ status: 200, description: 'List of lens types', type: [LensTypeInfoDto] })
  getLensTypes(): LensTypeInfoDto[] {
    return this.moleculesService.getLensTypes();
  }

  @Get('statistics')
  @ApiOperation({
    summary: 'Get molecule statistics',
    description: 'Returns aggregate statistics about molecules.',
  })
  @ApiResponse({ status: 200, description: 'Molecule statistics', type: MoleculeStatisticsDto })
  async getStatistics(): Promise<MoleculeStatisticsDto> {
    return this.moleculesService.getStatistics();
  }

  @Get('orphan-atoms')
  @ApiOperation({
    summary: 'Get orphan atoms',
    description: 'Returns atoms that are not in any molecule.',
  })
  @ApiResponse({ status: 200, description: 'List of orphan atoms', type: [Atom] })
  async getOrphanAtoms(): Promise<Atom[]> {
    return this.moleculesService.getOrphanAtoms();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a molecule by ID',
    description: 'Returns a single molecule with its relations and computed metrics.',
  })
  @ApiParam({ name: 'id', description: 'Molecule UUID' })
  @ApiResponse({ status: 200, description: 'Molecule details', type: MoleculeResponseDto })
  @ApiResponse({ status: 404, description: 'Molecule not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<MoleculeResponseDto> {
    const molecule = await this.moleculesService.findOne(id);
    const metrics = await this.moleculesService.getMetrics(id);
    return MoleculeResponseDto.fromEntity(molecule, metrics);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a molecule',
    description: 'Updates an existing molecule. All fields are optional.',
  })
  @ApiParam({ name: 'id', description: 'Molecule UUID' })
  @ApiResponse({ status: 200, description: 'Molecule updated', type: Molecule })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Molecule not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMoleculeDto,
  ): Promise<Molecule> {
    return this.moleculesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a molecule',
    description: 'Deletes a molecule. This does NOT delete the atoms in the molecule.',
  })
  @ApiParam({ name: 'id', description: 'Molecule UUID' })
  @ApiResponse({ status: 204, description: 'Molecule deleted' })
  @ApiResponse({ status: 404, description: 'Molecule not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.moleculesService.remove(id);
  }

  // ========================================
  // Atom Management
  // ========================================

  @Get(':id/atoms')
  @ApiOperation({
    summary: 'Get atoms in a molecule',
    description: 'Returns atoms in the molecule with optional transitive closure.',
  })
  @ApiParam({ name: 'id', description: 'Molecule UUID' })
  @ApiResponse({ status: 200, description: 'List of atoms', type: [Atom] })
  @ApiResponse({ status: 404, description: 'Molecule not found' })
  async getAtoms(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetAtomsQueryDto,
  ): Promise<Atom[]> {
    return this.moleculesService.getAtoms(id, query);
  }

  @Post(':id/atoms')
  @ApiOperation({
    summary: 'Add an atom to a molecule',
    description: 'Adds a single atom to the molecule.',
  })
  @ApiParam({ name: 'id', description: 'Molecule UUID' })
  @ApiResponse({ status: 201, description: 'Atom added', type: MoleculeAtom })
  @ApiResponse({ status: 404, description: 'Molecule or atom not found' })
  @ApiResponse({ status: 409, description: 'Atom already in molecule' })
  async addAtom(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddAtomToMoleculeDto,
  ): Promise<MoleculeAtom> {
    // TODO: Get userId from auth context
    const userId = 'system';
    return this.moleculesService.addAtom(id, dto, userId);
  }

  @Post(':id/atoms:batch')
  @ApiOperation({
    summary: 'Batch add atoms to a molecule',
    description: 'Adds multiple atoms to the molecule in a single operation.',
  })
  @ApiParam({ name: 'id', description: 'Molecule UUID' })
  @ApiResponse({ status: 201, description: 'Atoms added', type: [MoleculeAtom] })
  @ApiResponse({ status: 404, description: 'Molecule or atoms not found' })
  async batchAddAtoms(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BatchAddAtomsDto,
  ): Promise<MoleculeAtom[]> {
    // TODO: Get userId from auth context
    const userId = 'system';
    return this.moleculesService.batchAddAtoms(id, dto, userId);
  }

  @Delete(':id/atoms/:atomId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove an atom from a molecule',
    description: 'Removes an atom from the molecule (soft delete - preserves history).',
  })
  @ApiParam({ name: 'id', description: 'Molecule UUID' })
  @ApiParam({ name: 'atomId', description: 'Atom UUID' })
  @ApiResponse({ status: 204, description: 'Atom removed' })
  @ApiResponse({ status: 404, description: 'Atom not in molecule' })
  async removeAtom(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('atomId', ParseUUIDPipe) atomId: string,
  ): Promise<void> {
    // TODO: Get userId from auth context
    const userId = 'system';
    return this.moleculesService.removeAtom(id, atomId, userId);
  }

  @Patch(':id/atoms:reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reorder atoms in a molecule',
    description: 'Updates the display order of atoms within the molecule.',
  })
  @ApiParam({ name: 'id', description: 'Molecule UUID' })
  @ApiResponse({ status: 204, description: 'Atoms reordered' })
  @ApiResponse({ status: 404, description: 'Molecule not found' })
  async reorderAtoms(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderAtomsDto,
  ): Promise<void> {
    return this.moleculesService.reorderAtoms(id, dto);
  }

  @Patch(':id/atoms:batchUpdate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Batch update atom properties',
    description: 'Updates order and/or notes for multiple atoms.',
  })
  @ApiParam({ name: 'id', description: 'Molecule UUID' })
  @ApiResponse({ status: 204, description: 'Atoms updated' })
  @ApiResponse({ status: 404, description: 'Molecule not found' })
  async batchUpdateAtoms(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BatchUpdateAtomsDto,
  ): Promise<void> {
    return this.moleculesService.batchUpdateAtoms(id, dto);
  }

  // ========================================
  // Hierarchy Navigation
  // ========================================

  @Get(':id/children')
  @ApiOperation({
    summary: 'Get child molecules',
    description: 'Returns direct child molecules of the specified molecule.',
  })
  @ApiParam({ name: 'id', description: 'Molecule UUID' })
  @ApiResponse({ status: 200, description: 'List of child molecules', type: [Molecule] })
  @ApiResponse({ status: 404, description: 'Molecule not found' })
  async getChildren(@Param('id', ParseUUIDPipe) id: string): Promise<Molecule[]> {
    return this.moleculesService.getChildren(id);
  }

  @Get(':id/ancestors')
  @ApiOperation({
    summary: 'Get ancestor chain',
    description: 'Returns the chain of ancestors from immediate parent to root.',
  })
  @ApiParam({ name: 'id', description: 'Molecule UUID' })
  @ApiResponse({ status: 200, description: 'List of ancestor molecules', type: [Molecule] })
  async getAncestors(@Param('id', ParseUUIDPipe) id: string): Promise<Molecule[]> {
    return this.moleculesService.getAncestors(id);
  }

  // ========================================
  // Metrics
  // ========================================

  @Get(':id/metrics')
  @ApiOperation({
    summary: 'Get molecule metrics',
    description: 'Returns computed metrics for the molecule.',
  })
  @ApiParam({ name: 'id', description: 'Molecule UUID' })
  @ApiResponse({ status: 200, description: 'Molecule metrics', type: MoleculeMetricsDto })
  @ApiResponse({ status: 404, description: 'Molecule not found' })
  async getMetrics(@Param('id', ParseUUIDPipe) id: string): Promise<MoleculeMetricsDto> {
    return this.moleculesService.getMetrics(id);
  }
}

// ========================================
// Change Set Controller
// ========================================

@ApiTags('change-sets')
@Controller('change-sets')
export class ChangeSetsController {
  constructor(private readonly moleculesService: MoleculesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new change set',
    description: 'Creates a change set molecule for grouping proposed atom changes.',
  })
  @ApiResponse({ status: 201, description: 'Change set created', type: Molecule })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async create(
    @Body()
    body: {
      name: string;
      description?: string;
      summary?: string;
      sourceRef?: string;
      source?: 'manual' | 'reconciliation' | 'import';
      reconciliationRunId?: string;
      tags?: string[];
    },
  ): Promise<Molecule> {
    const userId = 'system';
    return this.moleculesService.createChangeSet(body, userId);
  }

  @Get()
  @ApiOperation({
    summary: 'List change sets',
    description: 'Returns all change sets, optionally filtered by status.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['draft', 'review', 'approved', 'committed', 'rejected'],
  })
  @ApiResponse({ status: 200, description: 'List of change sets', type: [Molecule] })
  async list(
    @Query('status') status?: 'draft' | 'review' | 'approved' | 'committed' | 'rejected',
  ): Promise<Molecule[]> {
    return this.moleculesService.listChangeSets(status);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a change set with atoms',
    description: 'Returns the change set molecule and its associated atoms.',
  })
  @ApiParam({ name: 'id', description: 'Change set UUID' })
  @ApiResponse({ status: 200, description: 'Change set details' })
  @ApiResponse({ status: 404, description: 'Change set not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ molecule: Molecule; atoms: Atom[] }> {
    return this.moleculesService.getChangeSet(id);
  }

  @Post(':id/atoms')
  @ApiOperation({
    summary: 'Add an atom to a change set',
    description: 'Adds an atom to a draft change set.',
  })
  @ApiParam({ name: 'id', description: 'Change set UUID' })
  @ApiResponse({ status: 201, description: 'Atom added' })
  @ApiResponse({ status: 400, description: 'Change set not in draft status' })
  @HttpCode(HttpStatus.CREATED)
  async addAtom(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { atomId: string; note?: string },
  ): Promise<void> {
    const userId = 'system';
    return this.moleculesService.addAtomToChangeSet(id, body.atomId, userId, body.note);
  }

  @Post(':id/submit')
  @ApiOperation({
    summary: 'Submit change set for review',
    description: 'Transitions a draft change set to review status.',
  })
  @ApiParam({ name: 'id', description: 'Change set UUID' })
  @ApiResponse({ status: 200, description: 'Change set submitted for review' })
  @ApiResponse({ status: 400, description: 'Change set not in draft status or empty' })
  async submitForReview(@Param('id', ParseUUIDPipe) id: string): Promise<Molecule> {
    const userId = 'system';
    return this.moleculesService.submitChangeSetForReview(id, userId);
  }

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve or reject a change set',
    description: 'Records an approval or rejection decision on a change set in review.',
  })
  @ApiParam({ name: 'id', description: 'Change set UUID' })
  @ApiResponse({ status: 200, description: 'Decision recorded' })
  @ApiResponse({ status: 400, description: 'Change set not in review status' })
  @ApiResponse({ status: 409, description: 'User already submitted a decision' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { decision: 'approved' | 'rejected'; comment?: string },
  ): Promise<Molecule> {
    const userId = 'system';
    return this.moleculesService.approveChangeSet(id, userId, body.decision, body.comment);
  }

  @Post(':id/commit')
  @ApiOperation({
    summary: 'Commit a change set',
    description: 'Batch commits all draft atoms in an approved change set.',
  })
  @ApiParam({ name: 'id', description: 'Change set UUID' })
  @ApiResponse({ status: 200, description: 'Change set committed' })
  @ApiResponse({ status: 400, description: 'Change set not approved or atoms fail quality gate' })
  async commit(@Param('id', ParseUUIDPipe) id: string): Promise<Molecule> {
    const userId = 'system';
    return this.moleculesService.commitChangeSet(id, userId);
  }
}
