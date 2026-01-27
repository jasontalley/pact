import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateTemplateDto } from './create-template.dto';

/**
 * DTO for updating an existing template
 * Excludes isBuiltin as built-in templates cannot be modified
 */
export class UpdateTemplateDto extends PartialType(
  OmitType(CreateTemplateDto, ['isBuiltin'] as const),
) {}
