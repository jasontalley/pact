import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ValidatorFormat } from '../validator.entity';
import { TemplateCategory, ParameterSchema } from '../validator-template.entity';

/**
 * DTO for template API responses
 */
export class TemplateResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the template',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Human-readable name for the template',
    example: 'Role-Based Access Check',
  })
  name: string;

  @ApiProperty({
    description: 'Detailed description of what this template validates',
    example: 'Validates that users with a specific role can access a resource',
  })
  description: string;

  @ApiProperty({
    description: 'Category for organization and filtering',
    enum: [
      'authentication',
      'authorization',
      'data-integrity',
      'performance',
      'state-transition',
      'error-handling',
      'custom',
    ],
    example: 'authorization',
  })
  category: TemplateCategory;

  @ApiProperty({
    description: 'Format of the template content',
    enum: ['gherkin', 'natural_language', 'typescript', 'json'],
    example: 'gherkin',
  })
  format: ValidatorFormat;

  @ApiProperty({
    description: 'Template content with {{placeholder}} substitution markers',
    example:
      'Given a user with role {{roleName}}\nWhen they access {{resource}}\nThen access is granted',
  })
  templateContent: string;

  @ApiProperty({
    description: 'JSON Schema defining the parameters this template accepts',
    example: {
      type: 'object',
      properties: {
        roleName: { type: 'string', description: 'The required role name' },
        resource: { type: 'string', description: 'The resource path to access' },
      },
      required: ['roleName', 'resource'],
    },
  })
  parametersSchema: ParameterSchema;

  @ApiPropertyOptional({
    description: 'Example of how to use this template',
    example:
      'To check admin access to user list:\n{\n  "roleName": "admin",\n  "resource": "/api/users"\n}',
  })
  exampleUsage: string | null;

  @ApiProperty({
    description: 'Searchable tags',
    type: [String],
    example: ['rbac', 'access-control', 'security'],
  })
  tags: string[];

  @ApiProperty({
    description: 'Whether this is a system-provided template',
    example: true,
  })
  isBuiltin: boolean;

  @ApiProperty({
    description: 'Number of validators created from this template',
    example: 42,
  })
  usageCount: number;

  @ApiProperty({
    description: 'When the template was created',
    example: '2026-01-21T10:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'When the template was last updated',
    example: '2026-01-21T10:30:00Z',
  })
  updatedAt: Date;
}
