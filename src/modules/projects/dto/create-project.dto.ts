import { IsString, IsNotEmpty, IsOptional, IsObject, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectSettings } from '../project.entity';

/**
 * DTO for creating a new Project
 */
export class CreateProjectDto {
  @ApiProperty({
    description: 'Name of the project',
    minLength: 1,
    maxLength: 255,
    example: 'My Pact Project',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: 'Description of the project',
    example: 'A project for managing user authentication features',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Project-specific settings',
    example: { enforceInvariants: true, qualityThreshold: 80 },
  })
  @IsObject()
  @IsOptional()
  settings?: ProjectSettings;

  @ApiPropertyOptional({
    description: 'Additional metadata for the project',
    example: { team: 'platform', priority: 'high' },
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
