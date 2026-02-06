import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ConflictsService } from './conflicts.service';
import { CreateConflictDto } from './dto/create-conflict.dto';
import { ResolveConflictDto } from './dto/resolve-conflict.dto';
import { ConflictRecord } from './conflict-record.entity';
import { ConflictFilters, ConflictMetrics, ConflictStatus, ConflictType } from './conflict.types';

@ApiTags('conflicts')
@Controller('conflicts')
export class ConflictsController {
  constructor(private readonly conflictsService: ConflictsService) {}

  @Get()
  @ApiOperation({ summary: 'List conflicts with optional filters' })
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'resolved', 'escalated'] })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['same_test', 'semantic_overlap', 'contradiction', 'cross_boundary'],
  })
  @ApiQuery({ name: 'atomId', required: false })
  @ApiResponse({ status: 200, description: 'List of conflicts' })
  findAll(
    @Query('status') status?: ConflictStatus,
    @Query('type') type?: ConflictType,
    @Query('atomId') atomId?: string,
  ): Promise<ConflictRecord[]> {
    const filters: ConflictFilters = {};
    if (status) filters.status = status;
    if (type) filters.type = type;
    if (atomId) filters.atomId = atomId;
    return this.conflictsService.findAll(filters);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get conflict metrics summary' })
  @ApiResponse({ status: 200, description: 'Conflict metrics' })
  getMetrics(): Promise<ConflictMetrics> {
    return this.conflictsService.getMetrics();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single conflict by ID' })
  @ApiParam({ name: 'id', description: 'UUID of the conflict' })
  @ApiResponse({ status: 200, description: 'Conflict details' })
  @ApiResponse({ status: 404, description: 'Conflict not found' })
  findOne(@Param('id') id: string): Promise<ConflictRecord> {
    return this.conflictsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Manually report a conflict' })
  @ApiResponse({ status: 201, description: 'Conflict created' })
  create(@Body() dto: CreateConflictDto): Promise<ConflictRecord> {
    return this.conflictsService.create(dto);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Resolve a conflict' })
  @ApiParam({ name: 'id', description: 'UUID of the conflict' })
  @ApiResponse({ status: 200, description: 'Conflict resolved' })
  @ApiResponse({ status: 404, description: 'Conflict not found' })
  resolve(@Param('id') id: string, @Body() dto: ResolveConflictDto): Promise<ConflictRecord> {
    return this.conflictsService.resolve(id, dto);
  }

  @Patch(':id/escalate')
  @ApiOperation({ summary: 'Escalate a conflict' })
  @ApiParam({ name: 'id', description: 'UUID of the conflict' })
  @ApiResponse({ status: 200, description: 'Conflict escalated' })
  @ApiResponse({ status: 404, description: 'Conflict not found' })
  escalate(@Param('id') id: string): Promise<ConflictRecord> {
    return this.conflictsService.escalate(id);
  }
}
