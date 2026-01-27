import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectSettings } from '../project.entity';

/**
 * DTO for Project API responses
 */
export class ProjectResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the project',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Name of the project',
    example: 'My Pact Project',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Description of the project',
    example: 'A project for managing user authentication features',
  })
  description: string | null;

  @ApiProperty({
    description: 'Project-specific settings',
    example: { enforceInvariants: true, qualityThreshold: 80 },
  })
  settings: ProjectSettings;

  @ApiProperty({
    description: 'When the project was created',
    example: '2026-01-21T10:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'When the project was last updated',
    example: '2026-01-21T10:00:00Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Additional metadata',
    example: { team: 'platform' },
  })
  metadata: Record<string, unknown>;
}
