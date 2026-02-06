import { IsString, IsNotEmpty, IsUUID, IsObject, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for instantiating a validator from a template
 */
export class InstantiateTemplateDto {
  @ApiProperty({
    description: 'UUID of the template to instantiate',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  templateId: string;

  @ApiProperty({
    description: 'UUID of the atom to associate the validator with',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsUUID()
  @IsNotEmpty()
  atomId: string;

  @ApiProperty({
    description: 'Parameters to substitute in the template',
    example: { roleName: 'admin', resource: '/api/users' },
  })
  @IsObject()
  @IsNotEmpty()
  parameters: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Override the default validator name',
    minLength: 3,
    example: 'Admin User List Access',
  })
  @IsString()
  @MinLength(3)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Override the default validator description',
    example: 'Validates that admins can access the user list',
  })
  @IsString()
  @IsOptional()
  description?: string;
}
