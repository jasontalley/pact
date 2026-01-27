import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CommitmentImmutabilityGuard } from '../../common/guards/commitment-immutability.guard';
import { CommitmentsService } from './commitments.service';
import { CreateCommitmentDto } from './dto/create-commitment.dto';
import { SupersedeCommitmentDto } from './dto/supersede-commitment.dto';
import { CommitmentSearchDto } from './dto/commitment-search.dto';
import { CommitmentResponseDto } from './dto/commitment-response.dto';
import { CommitmentPreviewDto } from './dto/commitment-preview.dto';

@ApiTags('commitments')
@Controller('commitments')
@UseGuards(CommitmentImmutabilityGuard)
export class CommitmentsController {
  constructor(private readonly commitmentsService: CommitmentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new commitment',
    description: 'Commits atoms, making them immutable. Requires human authorization (INV-006).',
  })
  @ApiResponse({
    status: 201,
    description: 'Commitment created successfully',
    type: CommitmentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input or invariant violations' })
  async create(@Body() dto: CreateCommitmentDto): Promise<CommitmentResponseDto> {
    return this.commitmentsService.create(dto);
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Preview a commitment (dry-run)',
    description: 'Runs all checks without creating the commitment. Use to identify issues.',
  })
  @ApiResponse({
    status: 200,
    description: 'Preview results',
    type: CommitmentPreviewDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async preview(@Body() dto: CreateCommitmentDto): Promise<CommitmentPreviewDto> {
    return this.commitmentsService.preview(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List commitments with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of commitments',
  })
  async findAll(@Query() query: CommitmentSearchDto) {
    return this.commitmentsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a commitment by ID' })
  @ApiParam({ name: 'id', description: 'Commitment UUID' })
  @ApiResponse({
    status: 200,
    description: 'Commitment found',
    type: CommitmentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Commitment not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CommitmentResponseDto> {
    return this.commitmentsService.findOne(id);
  }

  @Post(':id/supersede')
  @ApiOperation({
    summary: 'Supersede an existing commitment',
    description:
      'Creates a new commitment that supersedes the original. Original becomes immutable.',
  })
  @ApiParam({ name: 'id', description: 'Commitment UUID to supersede' })
  @ApiResponse({
    status: 201,
    description: 'New commitment created, original superseded',
    type: CommitmentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input or already superseded' })
  @ApiResponse({ status: 404, description: 'Original commitment not found' })
  async supersede(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupersedeCommitmentDto,
  ): Promise<CommitmentResponseDto> {
    return this.commitmentsService.supersede(id, dto);
  }

  @Get(':id/history')
  @ApiOperation({
    summary: 'Get supersession history for a commitment',
    description: 'Returns the full chain of commitments from original to latest.',
  })
  @ApiParam({ name: 'id', description: 'Commitment UUID' })
  @ApiResponse({
    status: 200,
    description: 'History chain',
    type: [CommitmentResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Commitment not found' })
  async getHistory(@Param('id', ParseUUIDPipe) id: string): Promise<CommitmentResponseDto[]> {
    return this.commitmentsService.getHistory(id);
  }

  @Get(':id/atoms')
  @ApiOperation({ summary: 'Get atoms included in a commitment' })
  @ApiParam({ name: 'id', description: 'Commitment UUID' })
  @ApiResponse({
    status: 200,
    description: 'Atoms in commitment',
  })
  @ApiResponse({ status: 404, description: 'Commitment not found' })
  async getAtoms(@Param('id', ParseUUIDPipe) id: string) {
    return this.commitmentsService.getAtoms(id);
  }
}
