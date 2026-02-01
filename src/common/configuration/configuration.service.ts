import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SystemConfiguration, ConfigDomain } from './entities/system-configuration.entity';
import { ConfigurationAuditLog } from './entities/configuration-audit-log.entity';
import {
  ConfigDefinition,
  ConfigValue,
  ConfigValueResponse,
  getDefinition,
  getDefinitionsByDomain,
  getAllDomains,
  ALL_CONFIG_DEFINITIONS,
} from './definitions';

/**
 * Event emitted when a configuration value changes
 */
export interface ConfigChangedEvent {
  domain: string;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  source: 'database';
  changedBy: string;
}

/**
 * ConfigurationService implements the layered configuration pattern:
 *
 * Precedence (highest to lowest):
 * 1. Database (UI overrides)
 * 2. Environment variables
 * 3. Code defaults
 *
 * This allows:
 * - Infrastructure teams to set defaults via .env
 * - Admins to tune at runtime via UI
 * - Safe fallbacks when nothing is configured
 */
@Injectable()
export class ConfigurationService implements OnModuleInit {
  private readonly logger = new Logger(ConfigurationService.name);
  private readonly cache = new Map<string, { value: unknown; source: string; timestamp: Date }>();
  private readonly startupTime = new Date();

  constructor(
    @InjectRepository(SystemConfiguration)
    private readonly configRepository: Repository<SystemConfiguration>,
    @InjectRepository(ConfigurationAuditLog)
    private readonly auditRepository: Repository<ConfigurationAuditLog>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('ConfigurationService initialized with layered configuration pattern');
    this.logger.log(`Registered ${ALL_CONFIG_DEFINITIONS.length} configuration definitions`);

    // Pre-warm cache with database values
    await this.warmCache();
  }

  /**
   * Get a configuration value with source tracking
   */
  async get<T>(domain: string, key: string): Promise<ConfigValue<T>> {
    const cacheKey = `${domain}:${key}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        value: cached.value as T,
        source: cached.source as 'code' | 'environment' | 'database',
        effectiveAt: cached.timestamp,
      };
    }

    // 1. Check database (highest priority)
    const dbValue = await this.configRepository.findOne({
      where: { domain: domain as ConfigDomain, key },
    });

    if (dbValue) {
      const result: ConfigValue<T> = {
        value: dbValue.value as T,
        source: 'database',
        effectiveAt: dbValue.updatedAt,
        changedBy: dbValue.updatedBy || undefined,
      };
      this.cache.set(cacheKey, {
        value: result.value,
        source: 'database',
        timestamp: dbValue.updatedAt,
      });
      return result;
    }

    // 2. Check environment variable
    const definition = getDefinition(domain, key);
    if (definition?.envVarName) {
      const envValue = process.env[definition.envVarName];
      if (envValue !== undefined) {
        const parsedValue = this.parseEnvValue<T>(envValue, definition.valueType);
        const result: ConfigValue<T> = {
          value: parsedValue,
          source: 'environment',
          effectiveAt: this.startupTime,
        };
        this.cache.set(cacheKey, {
          value: parsedValue,
          source: 'environment',
          timestamp: this.startupTime,
        });
        return result;
      }
    }

    // 3. Fall back to code default
    const codeDefault = definition?.codeDefault as T;
    const result: ConfigValue<T> = {
      value: codeDefault,
      source: 'code',
      effectiveAt: this.startupTime,
    };
    this.cache.set(cacheKey, { value: codeDefault, source: 'code', timestamp: this.startupTime });
    return result;
  }

  /**
   * Get a configuration value with full metadata
   */
  async getWithMetadata<T>(domain: string, key: string): Promise<ConfigValueResponse<T>> {
    const definition = getDefinition(domain, key);
    if (!definition) {
      throw new Error(`Unknown configuration: ${domain}.${key}`);
    }

    const configValue = await this.get<T>(domain, key);

    // Get environment value if different from current
    let envValue: T | undefined;
    if (definition.envVarName) {
      const envRaw = process.env[definition.envVarName];
      if (envRaw !== undefined) {
        envValue = this.parseEnvValue<T>(envRaw, definition.valueType);
        if (envValue === configValue.value) {
          envValue = undefined; // Don't show if same as current
        }
      }
    }

    // Get database record for last changed info
    const dbRecord = await this.configRepository.findOne({
      where: { domain: domain as ConfigDomain, key },
    });

    return {
      ...configValue,
      domain,
      key,
      valueType: definition.valueType,
      description: definition.description,
      category: definition.category,
      envVarName: definition.envVarName,
      codeDefault: definition.codeDefault as T,
      envValue,
      validation: definition.validation,
      requiresRestart: definition.requiresRestart ?? false,
      isSensitive: definition.isSensitive ?? false,
      isEditable: definition.isEditable ?? true,
      lastChangedAt: dbRecord?.updatedAt,
      lastChangedBy: dbRecord?.updatedBy || undefined,
    };
  }

  /**
   * Get all configurations for a domain
   */
  async getAllByDomain(domain: string): Promise<ConfigValueResponse<unknown>[]> {
    const definitions = getDefinitionsByDomain(domain);
    return Promise.all(definitions.map((def) => this.getWithMetadata(def.domain, def.key)));
  }

  /**
   * Get all configurations grouped by domain
   */
  async getAll(): Promise<Record<string, ConfigValueResponse<unknown>[]>> {
    const domains = getAllDomains();
    const result: Record<string, ConfigValueResponse<unknown>[]> = {};

    for (const domain of domains) {
      result[domain] = await this.getAllByDomain(domain);
    }

    return result;
  }

  /**
   * Set a configuration value (creates database override)
   */
  async set<T>(
    domain: string,
    key: string,
    value: T,
    changedBy: string,
    reason?: string,
  ): Promise<ConfigValueResponse<T>> {
    const definition = getDefinition(domain, key);
    if (!definition) {
      throw new Error(`Unknown configuration: ${domain}.${key}`);
    }

    if (definition.isEditable === false) {
      throw new Error(`Configuration ${domain}.${key} is not editable`);
    }

    // Validate value
    this.validateValue(value, definition);

    // Get current value for audit log
    const current = await this.get<T>(domain, key);

    // Upsert database record
    let dbRecord = await this.configRepository.findOne({
      where: { domain: domain as ConfigDomain, key },
    });

    if (dbRecord) {
      dbRecord.value = value;
      dbRecord.updatedBy = changedBy;
    } else {
      dbRecord = this.configRepository.create({
        domain: domain as ConfigDomain,
        key,
        value,
        valueType: definition.valueType,
        description: definition.description,
        envVarName: definition.envVarName,
        codeDefault: definition.codeDefault,
        validation: definition.validation,
        category: definition.category,
        isSensitive: definition.isSensitive ?? false,
        requiresRestart: definition.requiresRestart ?? false,
        updatedBy: changedBy,
      });
    }

    await this.configRepository.save(dbRecord);

    // Create audit log entry
    await this.auditRepository.save({
      configId: dbRecord.id,
      domain: domain as ConfigDomain,
      key,
      oldValue: current.value,
      newValue: value,
      changedBy,
      changeReason: reason,
    });

    // Invalidate cache
    this.cache.delete(`${domain}:${key}`);

    // Emit event for live reload
    this.eventEmitter.emit('config.changed', {
      domain,
      key,
      oldValue: current.value,
      newValue: value,
      source: 'database',
      changedBy,
    } as ConfigChangedEvent);

    this.logger.log(
      `Configuration ${domain}.${key} set to ${JSON.stringify(value)} by ${changedBy}`,
    );

    return this.getWithMetadata(domain, key);
  }

  /**
   * Reset a configuration to its default (removes database override)
   */
  async reset(
    domain: string,
    key: string,
    changedBy: string,
    reason?: string,
  ): Promise<ConfigValueResponse<unknown>> {
    const definition = getDefinition(domain, key);
    if (!definition) {
      throw new Error(`Unknown configuration: ${domain}.${key}`);
    }

    // Get current value for audit log
    const current = await this.get(domain, key);

    // Delete database record
    const dbRecord = await this.configRepository.findOne({
      where: { domain: domain as ConfigDomain, key },
    });

    if (dbRecord) {
      // Create audit log entry before deletion
      await this.auditRepository.save({
        configId: dbRecord.id,
        domain: domain as ConfigDomain,
        key,
        oldValue: current.value,
        newValue: null, // Indicates reset
        changedBy,
        changeReason: reason || 'Reset to default',
      });

      await this.configRepository.remove(dbRecord);
    }

    // Invalidate cache
    this.cache.delete(`${domain}:${key}`);

    // Emit event
    this.eventEmitter.emit('config.changed', {
      domain,
      key,
      oldValue: current.value,
      newValue: definition.codeDefault,
      source: 'database',
      changedBy,
    } as ConfigChangedEvent);

    this.logger.log(`Configuration ${domain}.${key} reset to default by ${changedBy}`);

    return this.getWithMetadata(domain, key);
  }

  /**
   * Get audit log entries
   */
  async getAuditLog(options: {
    domain?: string;
    key?: string;
    changedBy?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ items: ConfigurationAuditLog[]; total: number }> {
    const qb = this.auditRepository.createQueryBuilder('log');

    if (options.domain) {
      qb.andWhere('log.domain = :domain', { domain: options.domain });
    }
    if (options.key) {
      qb.andWhere('log.key = :key', { key: options.key });
    }
    if (options.changedBy) {
      qb.andWhere('log.changedBy = :changedBy', { changedBy: options.changedBy });
    }
    if (options.startDate) {
      qb.andWhere('log.changedAt >= :startDate', { startDate: options.startDate });
    }
    if (options.endDate) {
      qb.andWhere('log.changedAt <= :endDate', { endDate: options.endDate });
    }

    qb.orderBy('log.changedAt', 'DESC');

    const total = await qb.getCount();

    qb.skip(options.offset || 0);
    qb.take(options.limit || 50);

    const items = await qb.getMany();

    return { items, total };
  }

  /**
   * Pre-warm cache with database values
   */
  private async warmCache(): Promise<void> {
    const dbConfigs = await this.configRepository.find();
    for (const config of dbConfigs) {
      const cacheKey = `${config.domain}:${config.key}`;
      this.cache.set(cacheKey, {
        value: config.value,
        source: 'database',
        timestamp: config.updatedAt,
      });
    }
    this.logger.log(`Cache warmed with ${dbConfigs.length} database configurations`);
  }

  /**
   * Parse environment variable value to typed value
   */
  private parseEnvValue<T>(value: string, valueType: string): T {
    switch (valueType) {
      case 'number':
        return parseFloat(value) as T;
      case 'boolean':
        return (value.toLowerCase() === 'true') as T;
      case 'json':
        return JSON.parse(value) as T;
      default:
        return value as T;
    }
  }

  /**
   * Validate a value against its definition
   */
  private validateValue<T>(value: T, definition: ConfigDefinition): void {
    const validation = definition.validation;
    if (!validation) return;

    if (definition.valueType === 'number') {
      const numValue = value as number;
      if (validation.min !== undefined && numValue < validation.min) {
        throw new Error(`Value must be at least ${validation.min}`);
      }
      if (validation.max !== undefined && numValue > validation.max) {
        throw new Error(`Value must be at most ${validation.max}`);
      }
    }

    if (definition.valueType === 'string' && validation.enum) {
      if (!validation.enum.includes(value as string)) {
        throw new Error(`Value must be one of: ${validation.enum.join(', ')}`);
      }
    }

    if (definition.valueType === 'string' && validation.pattern) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value as string)) {
        throw new Error(`Value must match pattern: ${validation.pattern}`);
      }
    }
  }
}
