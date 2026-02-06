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
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplateSearchDto } from './dto/template-search.dto';
import { InstantiateTemplateDto } from './dto/instantiate-template.dto';
import { TemplateResponseDto } from './dto/template-response.dto';
import { ValidatorResponseDto } from './dto/validator-response.dto';
import { TemplateCategory } from './validator-template.entity';

@ApiTags('templates')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new validator template' })
  @ApiResponse({
    status: 201,
    description: 'Template created successfully',
    type: TemplateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async create(@Body() dto: CreateTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List templates with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'List of templates',
  })
  async findAll(@Query() query: TemplateSearchDto) {
    return this.templatesService.findAll(query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all template categories with counts' })
  @ApiResponse({
    status: 200,
    description: 'List of categories',
  })
  async getCategories() {
    return this.templatesService.getCategories();
  }

  @Get('tags')
  @ApiOperation({ summary: 'Get popular tags' })
  @ApiResponse({
    status: 200,
    description: 'List of popular tags',
  })
  async getPopularTags(@Query('limit') limit?: number) {
    return this.templatesService.getPopularTags(limit);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get template statistics' })
  @ApiResponse({
    status: 200,
    description: 'Template statistics',
  })
  async getStatistics() {
    return this.templatesService.getStatistics();
  }

  @Get('category/:category')
  @ApiOperation({ summary: 'Get templates by category' })
  @ApiParam({ name: 'category', description: 'Template category' })
  @ApiResponse({
    status: 200,
    description: 'Templates in category',
  })
  async findByCategory(@Param('category') category: TemplateCategory) {
    return this.templatesService.findByCategory(category);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a template by ID' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({
    status: 200,
    description: 'Template found',
    type: TemplateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.findOne(id);
  }

  @Get(':id/usage')
  @ApiOperation({ summary: 'Get validators created from this template' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({
    status: 200,
    description: 'Template usage information',
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getUsage(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.getTemplateUsage(id);
  }

  @Post(':id/instantiate')
  @ApiOperation({ summary: 'Create a validator from this template' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({
    status: 201,
    description: 'Validator created from template',
    type: ValidatorResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async instantiate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Omit<InstantiateTemplateDto, 'templateId'>,
  ) {
    return this.templatesService.instantiate({ ...dto, templateId: id });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a template (user-created only)' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({
    status: 200,
    description: 'Template updated successfully',
    type: TemplateResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Cannot modify built-in templates' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a template (user-created only)' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({
    status: 204,
    description: 'Template deleted',
  })
  @ApiResponse({ status: 403, description: 'Cannot delete built-in templates' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.templatesService.remove(id);
  }
}
