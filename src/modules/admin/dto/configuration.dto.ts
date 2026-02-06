import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsDateString,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for setting a configuration value
 */
export class SetConfigValueDto {
  @ApiProperty({ description: 'The value to set' })
  @IsNotEmpty()
  value: unknown;

  @ApiPropertyOptional({ description: 'Reason for the change' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * DTO for audit log query filters
 */
export class AuditLogFiltersDto {
  @ApiPropertyOptional({ description: 'Filter by domain' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ description: 'Filter by key' })
  @IsOptional()
  @IsString()
  key?: string;

  @ApiPropertyOptional({ description: 'Filter by user who made the change' })
  @IsOptional()
  @IsString()
  changedBy?: string;

  @ApiPropertyOptional({ description: 'Filter by start date (ISO string)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter by end date (ISO string)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Number of items to return', default: 50 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Number of items to skip', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number;
}

/**
 * Response DTO for a configuration value
 */
export class ConfigValueResponseDto {
  @ApiProperty()
  domain: string;

  @ApiProperty()
  key: string;

  @ApiProperty()
  value: unknown;

  @ApiProperty()
  valueType: 'number' | 'boolean' | 'string' | 'json';

  @ApiProperty()
  source: 'code' | 'environment' | 'database';

  @ApiProperty()
  description: string;

  @ApiProperty()
  category: string;

  @ApiPropertyOptional()
  envVarName?: string;

  @ApiProperty()
  codeDefault: unknown;

  @ApiPropertyOptional()
  envValue?: unknown;

  @ApiPropertyOptional()
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };

  @ApiProperty()
  requiresRestart: boolean;

  @ApiProperty()
  isSensitive: boolean;

  @ApiProperty()
  isEditable: boolean;

  @ApiProperty()
  effectiveAt: Date;

  @ApiPropertyOptional()
  changedBy?: string;

  @ApiPropertyOptional()
  lastChangedAt?: Date;

  @ApiPropertyOptional()
  lastChangedBy?: string;
}

/**
 * Response DTO for domain configurations
 */
export class DomainConfigResponseDto {
  @ApiProperty()
  domain: string;

  @ApiProperty({ type: [ConfigValueResponseDto] })
  configs: ConfigValueResponseDto[];
}

/**
 * Response DTO for all system configurations
 */
export class SystemConfigResponseDto {
  @ApiProperty({ type: [ConfigValueResponseDto] })
  agent: ConfigValueResponseDto[];

  @ApiProperty({ type: [ConfigValueResponseDto] })
  resilience: ConfigValueResponseDto[];

  @ApiProperty({ type: [ConfigValueResponseDto] })
  safety: ConfigValueResponseDto[];

  @ApiProperty({ type: [ConfigValueResponseDto] })
  observability: ConfigValueResponseDto[];

  @ApiProperty({ type: [ConfigValueResponseDto] })
  features: ConfigValueResponseDto[];
}

/**
 * Response DTO for audit log entry
 */
export class AuditLogEntryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  domain: string;

  @ApiProperty()
  key: string;

  @ApiPropertyOptional()
  oldValue: unknown;

  @ApiPropertyOptional()
  newValue: unknown;

  @ApiProperty()
  changedBy: string;

  @ApiProperty()
  changedAt: Date;

  @ApiPropertyOptional()
  changeReason?: string;
}

/**
 * Response DTO for paginated audit log
 */
export class PaginatedAuditLogDto {
  @ApiProperty({ type: [AuditLogEntryDto] })
  items: AuditLogEntryDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  offset: number;
}
