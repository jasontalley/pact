import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  Max,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AtomCategory, ObservableOutcome, FalsifiabilityCriterion } from '../atom.entity';
import { ObservableOutcomeDto, FalsifiabilityCriterionDto } from './create-atom.dto';

/**
 * DTO for superseding an atom with a new version
 *
 * This creates a new atom and marks the original as superseded in one operation.
 * Useful when you need to "fix" or "update" a committed atom.
 */
export class SupersedeAtomDto {
  @ApiProperty({
    description: 'The new description for the superseding atom',
    example: 'User can log in with email and password within 3 seconds',
  })
  @IsString()
  @IsNotEmpty()
  newDescription: string;

  @ApiPropertyOptional({
    description: 'Category for the new atom (defaults to original atom category)',
    enum: ['functional', 'performance', 'security', 'reliability', 'usability', 'maintainability'],
  })
  @IsOptional()
  @IsEnum(
    ['functional', 'performance', 'security', 'reliability', 'usability', 'maintainability'],
    {
      message:
        'Category must be one of: functional, performance, security, reliability, usability, maintainability',
    },
  )
  category?: AtomCategory;

  @ApiPropertyOptional({
    description: 'Quality score for the new atom (0-100)',
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  qualityScore?: number;

  @ApiPropertyOptional({
    description: 'Tags for the new atom (defaults to original atom tags)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Observable outcomes for the new atom',
    type: [ObservableOutcomeDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ObservableOutcomeDto)
  observableOutcomes?: ObservableOutcome[];

  @ApiPropertyOptional({
    description: 'Falsifiability criteria for the new atom',
    type: [FalsifiabilityCriterionDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FalsifiabilityCriterionDto)
  falsifiabilityCriteria?: FalsifiabilityCriterion[];

  @ApiPropertyOptional({
    description: 'Reason for supersession (recorded in the new atom)',
    example: 'Fixed timing constraint from 5 seconds to 3 seconds per performance requirements',
  })
  @IsOptional()
  @IsString()
  supersessionReason?: string;
}

/**
 * Response DTO for supersession operation
 */
export class SupersessionResultDto {
  @ApiProperty({ description: 'The original atom (now superseded)' })
  originalAtom: any;

  @ApiProperty({ description: 'The new superseding atom' })
  newAtom: any;

  @ApiProperty({ description: 'Summary message' })
  message: string;
}
