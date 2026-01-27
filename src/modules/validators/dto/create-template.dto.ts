import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsBoolean,
  MinLength,
  IsEnum,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ValidatorFormat } from '../validator.entity';
import { TemplateCategory, ParameterSchema } from '../validator-template.entity';

/**
 * DTO for creating a new validator template
 */
export class CreateTemplateDto {
  @ApiProperty({
    description: 'Human-readable name for the template',
    minLength: 3,
    example: 'Role-Based Access Check',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Name must be at least 3 characters long' })
  name: string;

  @ApiProperty({
    description: 'Detailed description of what this template validates',
    minLength: 10,
    example: 'Validates that users with a specific role can access a resource',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Description must be at least 10 characters long' })
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
  @IsString()
  @IsNotEmpty()
  @IsEnum(
    [
      'authentication',
      'authorization',
      'data-integrity',
      'performance',
      'state-transition',
      'error-handling',
      'custom',
    ],
    {
      message:
        'Category must be one of: authentication, authorization, data-integrity, performance, state-transition, error-handling, custom',
    },
  )
  category: TemplateCategory;

  @ApiProperty({
    description: 'Format of the template content',
    enum: ['gherkin', 'natural_language', 'typescript', 'json'],
    example: 'gherkin',
  })
  @IsString()
  @IsNotEmpty()
  @IsEnum(['gherkin', 'natural_language', 'typescript', 'json'], {
    message: 'Format must be one of: gherkin, natural_language, typescript, json',
  })
  format: ValidatorFormat;

  @ApiProperty({
    description: 'Template content with {{placeholder}} substitution markers',
    minLength: 10,
    example:
      'Given a user with role {{roleName}}\nWhen they access {{resource}}\nThen access is granted',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Template content must be at least 10 characters long' })
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
  @IsObject()
  @IsNotEmpty()
  parametersSchema: ParameterSchema;

  @ApiPropertyOptional({
    description: 'Example of how to use this template with sample parameters',
    example:
      'To check admin access to user list:\n{\n  "roleName": "admin",\n  "resource": "/api/users"\n}',
  })
  @IsString()
  @IsOptional()
  exampleUsage?: string;

  @ApiPropertyOptional({
    description: 'Searchable tags for discovery',
    type: [String],
    example: ['rbac', 'access-control', 'security'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Whether this is a system-provided template (only for seed scripts)',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isBuiltin?: boolean;
}
