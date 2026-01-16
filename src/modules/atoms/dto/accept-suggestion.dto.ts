import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Type of refinement suggestion
 */
export type RefinementType = 'clarification' | 'decomposition' | 'precision' | 'rewrite';

/**
 * DTO for accepting a refinement suggestion
 */
export class AcceptSuggestionDto {
  @ApiProperty({
    description: 'Unique identifier for the suggestion',
    example: 'decomp-0',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Type of refinement',
    enum: ['clarification', 'decomposition', 'precision', 'rewrite'],
    example: 'precision',
  })
  @IsString()
  @IsNotEmpty()
  type: RefinementType;

  @ApiProperty({
    description: 'The original intent text',
    example: 'User can authenticate',
  })
  @IsString()
  @IsNotEmpty()
  original: string;

  @ApiProperty({
    description: 'The suggested improved text',
    example: 'User can authenticate with email and password within 3 seconds',
  })
  @IsString()
  @IsNotEmpty()
  suggested: string;

  @ApiProperty({
    description: 'Reasoning behind the suggestion',
    example: 'Added measurable time constraint for testability',
  })
  @IsString()
  @IsNotEmpty()
  reasoning: string;

  @ApiProperty({
    description: 'Confidence score for this suggestion (0-1)',
    minimum: 0,
    maximum: 1,
    example: 0.85,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;
}
