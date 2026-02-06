import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InvariantsService } from './invariants.service';
import { CreateInvariantDto } from './dto/create-invariant.dto';
import { UpdateInvariantDto } from './dto/update-invariant.dto';
import { InvariantResponseDto } from './dto/invariant-response.dto';

@ApiTags('invariants')
@Controller('invariants')
export class InvariantsController {
  constructor(private readonly invariantsService: InvariantsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new custom invariant' })
  @ApiResponse({
    status: 201,
    description: 'Invariant created successfully',
    type: InvariantResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input or duplicate ID' })
  async create(@Body() dto: CreateInvariantDto): Promise<InvariantResponseDto> {
    return this.invariantsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all invariants' })
  @ApiQuery({
    name: 'projectId',
    required: false,
    description: 'Filter by project ID (includes global defaults)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of invariants',
    type: [InvariantResponseDto],
  })
  async findAll(@Query('projectId') projectId?: string): Promise<InvariantResponseDto[]> {
    return this.invariantsService.findAll(projectId);
  }

  @Get('enabled')
  @ApiOperation({ summary: 'List enabled invariants' })
  @ApiQuery({
    name: 'projectId',
    required: false,
    description: 'Filter by project ID',
  })
  @ApiResponse({
    status: 200,
    description: 'List of enabled invariants',
    type: [InvariantResponseDto],
  })
  async findEnabled(@Query('projectId') projectId?: string): Promise<InvariantResponseDto[]> {
    return this.invariantsService.findEnabled(projectId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an invariant by ID' })
  @ApiParam({ name: 'id', description: 'Invariant config UUID' })
  @ApiResponse({
    status: 200,
    description: 'Invariant found',
    type: InvariantResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Invariant not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<InvariantResponseDto> {
    return this.invariantsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an invariant' })
  @ApiParam({ name: 'id', description: 'Invariant config UUID' })
  @ApiResponse({
    status: 200,
    description: 'Invariant updated successfully',
    type: InvariantResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Cannot modify built-in checkType' })
  @ApiResponse({ status: 404, description: 'Invariant not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvariantDto,
  ): Promise<InvariantResponseDto> {
    return this.invariantsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom invariant (built-in cannot be deleted)' })
  @ApiParam({ name: 'id', description: 'Invariant config UUID' })
  @ApiResponse({ status: 204, description: 'Invariant deleted' })
  @ApiResponse({ status: 403, description: 'Cannot delete built-in invariants' })
  @ApiResponse({ status: 404, description: 'Invariant not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.invariantsService.remove(id);
  }

  @Patch(':id/enable')
  @ApiOperation({ summary: 'Enable an invariant' })
  @ApiParam({ name: 'id', description: 'Invariant config UUID' })
  @ApiResponse({
    status: 200,
    description: 'Invariant enabled',
    type: InvariantResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Invariant not found' })
  async enable(@Param('id', ParseUUIDPipe) id: string): Promise<InvariantResponseDto> {
    return this.invariantsService.enable(id);
  }

  @Patch(':id/disable')
  @ApiOperation({ summary: 'Disable an invariant' })
  @ApiParam({ name: 'id', description: 'Invariant config UUID' })
  @ApiResponse({
    status: 200,
    description: 'Invariant disabled',
    type: InvariantResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Invariant not found' })
  async disable(@Param('id', ParseUUIDPipe) id: string): Promise<InvariantResponseDto> {
    return this.invariantsService.disable(id);
  }

  @Post('copy/:invariantId/project/:projectId')
  @ApiOperation({ summary: 'Copy a global invariant for project-specific configuration' })
  @ApiParam({ name: 'invariantId', description: 'Invariant identifier (e.g., INV-001)' })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiResponse({
    status: 201,
    description: 'Project-specific invariant config created',
    type: InvariantResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Config already exists for project' })
  @ApiResponse({ status: 404, description: 'Invariant not found' })
  async copyForProject(
    @Param('invariantId') invariantId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<InvariantResponseDto> {
    return this.invariantsService.copyForProject(invariantId, projectId);
  }
}
