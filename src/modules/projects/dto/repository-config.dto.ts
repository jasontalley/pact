import { IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Repository configuration response
 */
export class RepositoryConfigDto {
  @ApiProperty({ description: 'Configured repository path inside container' })
  repositoryPath: string;

  @ApiProperty({ description: 'Whether the path exists and is accessible' })
  isValid: boolean;

  @ApiPropertyOptional({ description: 'Whether the path contains a .git directory' })
  isGitRepo?: boolean;

  @ApiPropertyOptional({ description: 'Project ID the config belongs to' })
  projectId?: string;

  @ApiPropertyOptional({ description: 'Project name' })
  projectName?: string;
}

/**
 * Update repository configuration request
 */
export class UpdateRepositoryConfigDto {
  @ApiProperty({ description: 'Repository path inside container, e.g. /data/repo' })
  @IsString()
  repositoryPath: string;
}

/**
 * Validate path request
 */
export class ValidatePathDto {
  @ApiProperty({ description: 'Path to validate' })
  @IsString()
  path: string;
}

/**
 * Validate path response
 */
export class ValidatePathResultDto {
  @ApiProperty({ description: 'The validated path' })
  path: string;

  @ApiProperty({ description: 'Whether the path exists' })
  exists: boolean;

  @ApiProperty({ description: 'Whether it is a directory' })
  isDirectory: boolean;

  @ApiProperty({ description: 'Whether it is readable' })
  isReadable: boolean;

  @ApiPropertyOptional({ description: 'Whether it contains a .git directory' })
  isGitRepo?: boolean;

  @ApiPropertyOptional({ description: 'Number of top-level entries found' })
  fileCount?: number;

  @ApiPropertyOptional({ description: 'Error message if validation failed' })
  error?: string;
}
