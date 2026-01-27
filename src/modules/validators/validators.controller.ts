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
  Optional,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { ValidatorsService } from './validators.service';
import { ValidatorTranslationService } from './validator-translation.service';
import { CreateValidatorDto } from './dto/create-validator.dto';
import { UpdateValidatorDto } from './dto/update-validator.dto';
import { ValidatorSearchDto } from './dto/validator-search.dto';
import { ValidatorResponseDto } from './dto/validator-response.dto';
import { TranslateValidatorDto } from './dto/translate-validator.dto';
import { ValidatorFormat } from './validator.entity';

@ApiTags('validators')
@Controller('validators')
export class ValidatorsController {
  constructor(
    private readonly validatorsService: ValidatorsService,
    @Optional() private readonly translationService?: ValidatorTranslationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new validator' })
  @ApiResponse({
    status: 201,
    description: 'Validator created successfully',
    type: ValidatorResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Atom not found' })
  async create(@Body() dto: CreateValidatorDto) {
    return this.validatorsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List validators with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'List of validators',
  })
  async findAll(@Query() query: ValidatorSearchDto) {
    return this.validatorsService.findAll(query);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get validator statistics' })
  @ApiResponse({
    status: 200,
    description: 'Validator statistics',
  })
  async getStatistics() {
    return this.validatorsService.getStatistics();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a validator by ID' })
  @ApiParam({ name: 'id', description: 'Validator UUID' })
  @ApiResponse({
    status: 200,
    description: 'Validator found',
    type: ValidatorResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Validator not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.validatorsService.findOne(id);
  }

  @Get(':id/translations')
  @ApiOperation({ summary: 'Get cached translations for a validator' })
  @ApiParam({ name: 'id', description: 'Validator UUID' })
  @ApiResponse({
    status: 200,
    description: 'Cached translations',
  })
  @ApiResponse({ status: 404, description: 'Validator not found' })
  async getTranslations(@Param('id', ParseUUIDPipe) id: string) {
    return this.validatorsService.getTranslations(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a validator' })
  @ApiParam({ name: 'id', description: 'Validator UUID' })
  @ApiResponse({
    status: 200,
    description: 'Validator updated successfully',
    type: ValidatorResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Validator not found' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateValidatorDto) {
    return this.validatorsService.update(id, dto);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate a validator' })
  @ApiParam({ name: 'id', description: 'Validator UUID' })
  @ApiResponse({
    status: 200,
    description: 'Validator activated',
    type: ValidatorResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Validator not found' })
  async activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.validatorsService.activate(id);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a validator' })
  @ApiParam({ name: 'id', description: 'Validator UUID' })
  @ApiResponse({
    status: 200,
    description: 'Validator deactivated',
    type: ValidatorResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Validator not found' })
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.validatorsService.deactivate(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a validator (deactivate)' })
  @ApiParam({ name: 'id', description: 'Validator UUID' })
  @ApiResponse({
    status: 200,
    description: 'Validator deactivated',
    type: ValidatorResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Validator not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.validatorsService.remove(id);
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a validator' })
  @ApiParam({ name: 'id', description: 'Validator UUID' })
  @ApiResponse({
    status: 204,
    description: 'Validator permanently deleted',
  })
  @ApiResponse({ status: 404, description: 'Validator not found' })
  async hardRemove(@Param('id', ParseUUIDPipe) id: string) {
    await this.validatorsService.hardRemove(id);
  }

  // ========================
  // Translation Endpoints
  // ========================

  @Post('translate')
  @ApiOperation({
    summary: 'Translate validator content between formats',
    description:
      'Translates validator content from one format to another using AI-powered translation with heuristic fallbacks.',
  })
  @ApiBody({ type: TranslateValidatorDto })
  @ApiResponse({
    status: 200,
    description: 'Translation result',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        sourceFormat: { type: 'string' },
        targetFormat: { type: 'string' },
        confidence: { type: 'number' },
        warnings: { type: 'array', items: { type: 'string' } },
        wasLLMUsed: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 503, description: 'Translation service unavailable' })
  async translate(@Body() dto: TranslateValidatorDto) {
    if (!this.translationService) {
      throw new Error('Translation service is not available');
    }
    return this.translationService.translate(dto.content, dto.sourceFormat, dto.targetFormat);
  }

  @Post(':id/translate/:targetFormat')
  @ApiOperation({
    summary: 'Translate an existing validator to a new format',
    description:
      'Translates the content of an existing validator to the specified target format and caches the result.',
  })
  @ApiParam({ name: 'id', description: 'Validator UUID' })
  @ApiParam({
    name: 'targetFormat',
    description: 'Target format',
    enum: ['gherkin', 'natural_language', 'typescript', 'json'],
  })
  @ApiResponse({
    status: 200,
    description: 'Translation result with updated validator',
    schema: {
      type: 'object',
      properties: {
        translation: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            confidence: { type: 'number' },
            warnings: { type: 'array', items: { type: 'string' } },
          },
        },
        validator: { type: 'object' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Validator not found' })
  @ApiResponse({ status: 503, description: 'Translation service unavailable' })
  async translateValidator(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetFormat') targetFormat: ValidatorFormat,
  ) {
    if (!this.translationService) {
      throw new Error('Translation service is not available');
    }

    // Get the validator
    const validator = await this.validatorsService.findOne(id);

    // Translate the content
    const translation = await this.translationService.translate(
      validator.content,
      validator.format,
      targetFormat,
    );

    // Cache the translation
    const updatedValidator = await this.validatorsService.cacheTranslation(
      id,
      targetFormat,
      translation.content,
      translation.confidence,
    );

    return {
      translation,
      validator: updatedValidator,
    };
  }

  @Post(':id/validate-translation')
  @ApiOperation({
    summary: 'Validate a translation for semantic equivalence',
    description:
      'Compares the original validator content with a translated version to verify semantic preservation.',
  })
  @ApiParam({ name: 'id', description: 'Validator UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        translatedContent: { type: 'string' },
        targetFormat: {
          type: 'string',
          enum: ['gherkin', 'natural_language', 'typescript', 'json'],
        },
      },
      required: ['translatedContent', 'targetFormat'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
    schema: {
      type: 'object',
      properties: {
        isValid: { type: 'boolean' },
        semanticEquivalence: { type: 'number' },
        warnings: { type: 'array', items: { type: 'string' } },
        suggestions: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Validator not found' })
  @ApiResponse({ status: 503, description: 'Translation service unavailable' })
  async validateTranslation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { translatedContent: string; targetFormat: ValidatorFormat },
  ) {
    if (!this.translationService) {
      throw new Error('Translation service is not available');
    }

    const validator = await this.validatorsService.findOne(id);

    return this.translationService.validateTranslation(
      validator.content,
      body.translatedContent,
      validator.format,
      body.targetFormat,
    );
  }

  @Post(':id/test-round-trip/:targetFormat')
  @ApiOperation({
    summary: 'Test round-trip translation preservation',
    description:
      'Translates content to target format and back to original format to verify meaning preservation.',
  })
  @ApiParam({ name: 'id', description: 'Validator UUID' })
  @ApiParam({
    name: 'targetFormat',
    description: 'Intermediate format for round-trip',
    enum: ['gherkin', 'natural_language', 'typescript', 'json'],
  })
  @ApiResponse({
    status: 200,
    description: 'Round-trip test result',
    schema: {
      type: 'object',
      properties: {
        originalContent: { type: 'string' },
        translatedContent: { type: 'string' },
        roundTripContent: { type: 'string' },
        preservationScore: { type: 'number' },
        isAcceptable: { type: 'boolean' },
        differences: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Validator not found' })
  @ApiResponse({ status: 503, description: 'Translation service unavailable' })
  async testRoundTrip(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('targetFormat') targetFormat: ValidatorFormat,
  ) {
    if (!this.translationService) {
      throw new Error('Translation service is not available');
    }

    const validator = await this.validatorsService.findOne(id);

    return this.translationService.testRoundTrip(validator.content, validator.format, targetFormat);
  }
}
