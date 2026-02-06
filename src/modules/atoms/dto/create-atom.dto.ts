import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  MinLength,
  IsEnum,
  IsArray,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AtomCategory,
  AtomStatus,
  AtomSource,
  CanvasPosition,
  ObservableOutcome,
  FalsifiabilityCriterion,
} from '../atom.entity';

/**
 * DTO for canvas position validation
 */
export class CanvasPositionDto implements CanvasPosition {
  @ApiProperty({ description: 'X coordinate on canvas', example: 100 })
  @IsNumber()
  x: number;

  @ApiProperty({ description: 'Y coordinate on canvas', example: 200 })
  @IsNumber()
  y: number;
}

/**
 * DTO for observable outcome validation
 */
export class ObservableOutcomeDto implements ObservableOutcome {
  @ApiProperty({
    description: 'Description of the observable outcome',
    example: 'User sees a confirmation message',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({
    description: 'Criteria for measuring the outcome',
    example: 'Message appears within 2 seconds',
  })
  @IsString()
  @IsOptional()
  measurementCriteria?: string;
}

/**
 * DTO for falsifiability criterion validation
 */
export class FalsifiabilityCriterionDto implements FalsifiabilityCriterion {
  @ApiProperty({
    description: 'Condition that would disprove the atom',
    example: 'When user clicks submit without filling required fields',
  })
  @IsString()
  @IsNotEmpty()
  condition: string;

  @ApiProperty({
    description: 'Expected behavior under this condition',
    example: 'Form shows validation errors and does not submit',
  })
  @IsString()
  @IsNotEmpty()
  expectedBehavior: string;
}

/**
 * DTO for creating a new Intent Atom
 */
export class CreateAtomDto {
  @ApiProperty({
    description: 'Behavioral description of the Intent Atom',
    minLength: 10,
    example:
      'When a user submits the login form with valid credentials, the system authenticates and redirects to the dashboard',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Description must be at least 10 characters long' })
  description: string;

  @ApiProperty({
    description: 'Category classification for the Intent Atom',
    enum: ['functional', 'performance', 'security', 'reliability', 'usability', 'maintainability'],
    example: 'functional',
  })
  @IsString()
  @IsNotEmpty()
  @IsEnum(
    ['functional', 'performance', 'security', 'reliability', 'usability', 'maintainability'],
    {
      message:
        'Category must be one of: functional, performance, security, reliability, usability, maintainability',
    },
  )
  category: AtomCategory;

  @ApiPropertyOptional({
    description: 'Quality score (0-100), typically set by the quality validator',
    minimum: 0,
    maximum: 100,
    example: 85,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  qualityScore?: number;

  @ApiPropertyOptional({
    description: 'Identifier of the user who created the atom',
    example: 'user-123',
  })
  @IsString()
  @IsOptional()
  createdBy?: string;

  @ApiPropertyOptional({
    description: 'User-defined tags for filtering and organization',
    type: [String],
    example: ['authentication', 'mvp', 'security'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Position on the Canvas UI for visual organization',
    type: CanvasPositionDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => CanvasPositionDto)
  @IsOptional()
  canvasPosition?: CanvasPositionDto;

  @ApiPropertyOptional({
    description: 'Original user input that spawned this atom',
    example: 'I want users to be able to log in securely',
  })
  @IsString()
  @IsOptional()
  parentIntent?: string;

  @ApiPropertyOptional({
    description: 'Observable outcomes that can be verified externally',
    type: [ObservableOutcomeDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ObservableOutcomeDto)
  @IsOptional()
  observableOutcomes?: ObservableOutcomeDto[];

  @ApiPropertyOptional({
    description: 'Conditions that would disprove the atom intent',
    type: [FalsifiabilityCriterionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FalsifiabilityCriterionDto)
  @IsOptional()
  falsifiabilityCriteria?: FalsifiabilityCriterionDto[];

  // Phase 18: Agent-suggested atom fields

  @ApiPropertyOptional({
    description: 'Status of the atom',
    enum: ['draft', 'proposed', 'committed', 'superseded', 'abandoned'],
    example: 'proposed',
  })
  @IsString()
  @IsOptional()
  @IsEnum(['draft', 'proposed', 'committed', 'superseded', 'abandoned'])
  status?: AtomStatus;

  @ApiPropertyOptional({
    description: 'Source of the atom',
    enum: ['human', 'interview_agent', 'agent_inference', 'reconciliation_inference'],
    example: 'agent_inference',
  })
  @IsString()
  @IsOptional()
  @IsEnum(['human', 'interview_agent', 'agent_inference', 'reconciliation_inference'])
  source?: AtomSource;

  @ApiPropertyOptional({
    description: 'Confidence score for agent-suggested atoms (0.0-1.0)',
    minimum: 0,
    maximum: 1,
    example: 0.85,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({
    description: 'Rationale for why this atom was suggested',
    example:
      'Implementing password reset endpoint, but no atom exists for rate limiting to prevent abuse',
  })
  @IsString()
  @IsOptional()
  rationale?: string;

  @ApiPropertyOptional({
    description: 'UUID of a related or parent atom',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsOptional()
  relatedAtomId?: string;

  @ApiPropertyOptional({
    description: 'Identifier of the agent or user who proposed this atom',
    example: 'claude-code',
  })
  @IsString()
  @IsOptional()
  proposedBy?: string;
}
