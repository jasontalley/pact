import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { ValidatorsRepository, PaginatedValidatorsResponse } from './validators.repository';
import { Validator, ValidatorFormat } from './validator.entity';
import { CreateValidatorDto } from './dto/create-validator.dto';
import { UpdateValidatorDto } from './dto/update-validator.dto';
import { ValidatorSearchDto } from './dto/validator-search.dto';
import { AtomsService } from '../atoms/atoms.service';
import { ValidatorsGateway } from '../../gateways/validators.gateway';

/**
 * Service for managing validators
 * Handles CRUD operations and business logic for validators
 *
 * Emits WebSocket events for real-time updates:
 * - validator:created - when a new validator is created
 * - validator:updated - when a validator is updated
 * - validator:activated - when a validator is activated
 * - validator:deactivated - when a validator is deactivated
 * - validator:deleted - when a validator is hard deleted
 * - validator:translated - when a validator is translated to a new format
 */
@Injectable()
export class ValidatorsService {
  constructor(
    private readonly validatorsRepository: ValidatorsRepository,
    private readonly atomsService: AtomsService,
    @Optional() private readonly validatorsGateway?: ValidatorsGateway,
  ) {}

  /**
   * Create a new validator
   */
  async create(dto: CreateValidatorDto): Promise<Validator> {
    // Verify atom exists
    const atom = await this.atomsService.findOne(dto.atomId);
    if (!atom) {
      throw new NotFoundException(`Atom with ID ${dto.atomId} not found`);
    }

    const validator = this.validatorsRepository.baseRepository.create({
      ...dto,
      originalFormat: dto.format,
      translatedContent: {},
      isActive: true,
      executionCount: 0,
      lastExecutedAt: null,
      metadata: {},
    });

    const savedValidator = await this.validatorsRepository.baseRepository.save(validator);

    // Emit WebSocket event
    this.validatorsGateway?.emitValidatorCreated(savedValidator);

    return savedValidator;
  }

  /**
   * Find all validators with optional filtering and pagination
   */
  async findAll(options?: ValidatorSearchDto): Promise<PaginatedValidatorsResponse<Validator>> {
    return this.validatorsRepository.search(options || {});
  }

  /**
   * Find validators by atom ID
   */
  async findByAtom(atomId: string): Promise<Validator[]> {
    // Verify atom exists
    const atom = await this.atomsService.findOne(atomId);
    if (!atom) {
      throw new NotFoundException(`Atom with ID ${atomId} not found`);
    }

    return this.validatorsRepository.findByAtom(atomId);
  }

  /**
   * Find a single validator by ID
   */
  async findOne(id: string): Promise<Validator> {
    const validator = await this.validatorsRepository.baseRepository.findOne({
      where: { id },
      relations: ['atom'],
    });

    if (!validator) {
      throw new NotFoundException(`Validator with ID ${id} not found`);
    }

    return validator;
  }

  /**
   * Update a validator
   */
  async update(id: string, dto: UpdateValidatorDto): Promise<Validator> {
    const validator = await this.findOne(id);

    // If content or format is being updated, update the translatedContent cache
    if (dto.content || dto.format) {
      // Clear cached translations since content changed
      validator.translatedContent = {};
    }

    Object.assign(validator, dto);
    const savedValidator = await this.validatorsRepository.baseRepository.save(validator);

    // Emit WebSocket event
    this.validatorsGateway?.emitValidatorUpdated(savedValidator);

    return savedValidator;
  }

  /**
   * Soft delete a validator (set isActive to false)
   * This is a semantic "remove" that keeps the record but marks it inactive.
   */
  async remove(id: string): Promise<Validator> {
    const validator = await this.findOne(id);
    validator.isActive = false;
    const savedValidator = await this.validatorsRepository.baseRepository.save(validator);

    // Emit deactivated event (soft delete = deactivate)
    this.validatorsGateway?.emitValidatorDeactivated(savedValidator);

    return savedValidator;
  }

  /**
   * Permanently delete a validator
   */
  async hardRemove(id: string): Promise<void> {
    const validator = await this.findOne(id);
    const atomId = validator.atomId;
    const validatorId = validator.id;

    await this.validatorsRepository.baseRepository.remove(validator);

    // Emit WebSocket event
    this.validatorsGateway?.emitValidatorDeleted(validatorId, atomId);
  }

  /**
   * Activate a validator
   */
  async activate(id: string): Promise<Validator> {
    const validator = await this.findOne(id);
    validator.isActive = true;
    const savedValidator = await this.validatorsRepository.baseRepository.save(validator);

    // Emit WebSocket event
    this.validatorsGateway?.emitValidatorActivated(savedValidator);

    return savedValidator;
  }

  /**
   * Deactivate a validator (keeps the record but marks it inactive)
   */
  async deactivate(id: string): Promise<Validator> {
    const validator = await this.findOne(id);
    validator.isActive = false;
    const savedValidator = await this.validatorsRepository.baseRepository.save(validator);

    // Emit WebSocket event
    this.validatorsGateway?.emitValidatorDeactivated(savedValidator);

    return savedValidator;
  }

  /**
   * Get validation status summary for an atom
   */
  async getValidationStatus(atomId: string): Promise<{
    atomId: string;
    totalValidators: number;
    activeValidators: number;
    inactiveValidators: number;
    byType: Record<string, number>;
    byFormat: Record<string, number>;
  }> {
    // Verify atom exists
    const atom = await this.atomsService.findOne(atomId);
    if (!atom) {
      throw new NotFoundException(`Atom with ID ${atomId} not found`);
    }

    const validators = await this.validatorsRepository.findByAtom(atomId);

    const byType: Record<string, number> = {};
    const byFormat: Record<string, number> = {};
    let activeCount = 0;

    for (const v of validators) {
      byType[v.validatorType] = (byType[v.validatorType] || 0) + 1;
      byFormat[v.format] = (byFormat[v.format] || 0) + 1;
      if (v.isActive) activeCount++;
    }

    return {
      atomId,
      totalValidators: validators.length,
      activeValidators: activeCount,
      inactiveValidators: validators.length - activeCount,
      byType,
      byFormat,
    };
  }

  /**
   * Get validator count for an atom
   */
  async getCountByAtom(atomId: string): Promise<number> {
    return this.validatorsRepository.getCountByAtom(atomId);
  }

  /**
   * Get overall validator statistics
   */
  async getStatistics() {
    return this.validatorsRepository.getStatistics();
  }

  /**
   * Record validator execution
   */
  async recordExecution(id: string): Promise<void> {
    await this.validatorsRepository.incrementExecutionCount(id);
  }

  /**
   * Store a translation in the validator's cache
   */
  async cacheTranslation(
    id: string,
    targetFormat: ValidatorFormat,
    translatedContent: string,
    confidenceScore: number,
  ): Promise<Validator> {
    const validator = await this.findOne(id);

    validator.translatedContent = {
      ...validator.translatedContent,
      [targetFormat]: translatedContent,
      translatedAt: {
        ...validator.translatedContent.translatedAt,
        [targetFormat]: new Date(),
      },
      confidenceScores: {
        ...validator.translatedContent.confidenceScores,
        [targetFormat]: confidenceScore,
      },
    };

    const savedValidator = await this.validatorsRepository.baseRepository.save(validator);

    // Emit WebSocket event
    this.validatorsGateway?.emitValidatorTranslated(savedValidator, targetFormat);

    return savedValidator;
  }

  /**
   * Get cached translations for a validator
   */
  async getTranslations(id: string): Promise<{
    id: string;
    originalFormat: ValidatorFormat;
    translations: Record<string, { content: string; translatedAt?: Date; confidence?: number }>;
  }> {
    const validator = await this.findOne(id);

    const translations: Record<
      string,
      { content: string; translatedAt?: Date; confidence?: number }
    > = {};

    // Add original content
    translations[validator.originalFormat] = {
      content: validator.content,
    };

    // Add cached translations
    const formats: ValidatorFormat[] = ['gherkin', 'natural_language', 'typescript', 'json'];
    for (const format of formats) {
      if (format !== validator.originalFormat && validator.translatedContent[format]) {
        translations[format] = {
          content: validator.translatedContent[format] as string,
          translatedAt: validator.translatedContent.translatedAt?.[format],
          confidence: validator.translatedContent.confidenceScores?.[format],
        };
      }
    }

    return {
      id: validator.id,
      originalFormat: validator.originalFormat,
      translations,
    };
  }
}
