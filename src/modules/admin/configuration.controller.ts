import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Headers,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiHeader } from '@nestjs/swagger';
import { ConfigurationService } from '../../common/configuration';
import {
  SetConfigValueDto,
  AuditLogFiltersDto,
  ConfigValueResponseDto,
  DomainConfigResponseDto,
  SystemConfigResponseDto,
  PaginatedAuditLogDto,
} from './dto/configuration.dto';
import { getAllDomains, getDefinition } from '../../common/configuration/definitions';

/**
 * Configuration Controller
 *
 * Admin API for managing system configurations.
 * Implements the layered configuration pattern:
 * UI/Database (highest) → Environment → Code Default (lowest)
 */
@ApiTags('Admin - Configuration')
@Controller('admin/config')
export class ConfigurationController {
  constructor(private readonly configService: ConfigurationService) {}

  /**
   * Get all system configurations
   */
  @Get()
  @ApiOperation({ summary: 'Get all system configurations grouped by domain' })
  @ApiResponse({ status: 200, description: 'All configurations', type: SystemConfigResponseDto })
  async getAllConfigurations(): Promise<SystemConfigResponseDto> {
    const all = await this.configService.getAll();
    return {
      agent: (all['agent'] || []) as ConfigValueResponseDto[],
      resilience: (all['resilience'] || []) as ConfigValueResponseDto[],
      safety: (all['safety'] || []) as ConfigValueResponseDto[],
      observability: (all['observability'] || []) as ConfigValueResponseDto[],
      features: (all['features'] || []) as ConfigValueResponseDto[],
    };
  }

  /**
   * Get all configurations for a specific domain
   */
  @Get(':domain')
  @ApiOperation({ summary: 'Get all configurations for a domain' })
  @ApiParam({
    name: 'domain',
    description: 'Configuration domain (agent, resilience, safety, observability, features)',
  })
  @ApiResponse({ status: 200, description: 'Domain configurations', type: DomainConfigResponseDto })
  @ApiResponse({ status: 404, description: 'Domain not found' })
  async getByDomain(@Param('domain') domain: string): Promise<DomainConfigResponseDto> {
    const validDomains = getAllDomains();
    if (!validDomains.includes(domain)) {
      throw new NotFoundException(
        `Unknown domain: ${domain}. Valid domains: ${validDomains.join(', ')}`,
      );
    }

    const configs = await this.configService.getAllByDomain(domain);
    return {
      domain,
      configs: configs as ConfigValueResponseDto[],
    };
  }

  /**
   * Get a specific configuration value
   */
  @Get(':domain/:key')
  @ApiOperation({ summary: 'Get a specific configuration value with metadata' })
  @ApiParam({ name: 'domain', description: 'Configuration domain' })
  @ApiParam({ name: 'key', description: 'Configuration key' })
  @ApiResponse({ status: 200, description: 'Configuration value', type: ConfigValueResponseDto })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  async getValue(
    @Param('domain') domain: string,
    @Param('key') key: string,
  ): Promise<ConfigValueResponseDto> {
    const definition = getDefinition(domain, key);
    if (!definition) {
      throw new NotFoundException(`Unknown configuration: ${domain}.${key}`);
    }

    const config = await this.configService.getWithMetadata(domain, key);
    return config as ConfigValueResponseDto;
  }

  /**
   * Set a configuration value (creates database override)
   */
  @Put(':domain/:key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a configuration value' })
  @ApiParam({ name: 'domain', description: 'Configuration domain' })
  @ApiParam({ name: 'key', description: 'Configuration key' })
  @ApiHeader({ name: 'x-user-id', description: 'User ID making the change', required: false })
  @ApiResponse({ status: 200, description: 'Configuration updated', type: ConfigValueResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid value or configuration not editable' })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  async setValue(
    @Param('domain') domain: string,
    @Param('key') key: string,
    @Body() dto: SetConfigValueDto,
    @Headers('x-user-id') userId?: string,
  ): Promise<ConfigValueResponseDto> {
    const definition = getDefinition(domain, key);
    if (!definition) {
      throw new NotFoundException(`Unknown configuration: ${domain}.${key}`);
    }

    if (definition.isEditable === false) {
      throw new BadRequestException(`Configuration ${domain}.${key} is not editable via UI`);
    }

    const changedBy = userId || 'admin';

    try {
      const config = await this.configService.set(domain, key, dto.value, changedBy, dto.reason);
      return config as ConfigValueResponseDto;
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Reset a configuration to its default (removes database override)
   */
  @Delete(':domain/:key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset a configuration to its default value' })
  @ApiParam({ name: 'domain', description: 'Configuration domain' })
  @ApiParam({ name: 'key', description: 'Configuration key' })
  @ApiHeader({ name: 'x-user-id', description: 'User ID making the change', required: false })
  @ApiResponse({
    status: 200,
    description: 'Configuration reset to default',
    type: ConfigValueResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  async resetToDefault(
    @Param('domain') domain: string,
    @Param('key') key: string,
    @Headers('x-user-id') userId?: string,
  ): Promise<ConfigValueResponseDto> {
    const definition = getDefinition(domain, key);
    if (!definition) {
      throw new NotFoundException(`Unknown configuration: ${domain}.${key}`);
    }

    const changedBy = userId || 'admin';
    const config = await this.configService.reset(domain, key, changedBy);
    return config as ConfigValueResponseDto;
  }

  /**
   * Get configuration audit log
   */
  @Get('audit/log')
  @ApiOperation({ summary: 'Get configuration change audit log' })
  @ApiResponse({ status: 200, description: 'Audit log entries', type: PaginatedAuditLogDto })
  async getAuditLog(@Query() filters: AuditLogFiltersDto): Promise<PaginatedAuditLogDto> {
    const result = await this.configService.getAuditLog({
      domain: filters.domain,
      key: filters.key,
      changedBy: filters.changedBy,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    });

    return {
      items: result.items.map((item) => ({
        id: item.id,
        domain: item.domain,
        key: item.key,
        oldValue: item.oldValue,
        newValue: item.newValue,
        changedBy: item.changedBy,
        changedAt: item.changedAt,
        changeReason: item.changeReason || undefined,
      })),
      total: result.total,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
  }

  /**
   * Get list of available domains
   */
  @Get('meta/domains')
  @ApiOperation({ summary: 'Get list of available configuration domains' })
  @ApiResponse({ status: 200, description: 'List of domains' })
  async getDomains(): Promise<{ domains: string[] }> {
    return { domains: getAllDomains() };
  }
}
