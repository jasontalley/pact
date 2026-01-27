import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateValidatorDto } from './create-validator.dto';

/**
 * DTO for updating an existing validator
 * Excludes atomId and templateId as these should not be changed after creation
 */
export class UpdateValidatorDto extends PartialType(
  OmitType(CreateValidatorDto, ['atomId', 'templateId'] as const),
) {}
