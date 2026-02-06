import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigurationService, ConfigChangedEvent } from './configuration.service';
import { SystemConfiguration, ConfigDomain } from './entities/system-configuration.entity';
import { ConfigurationAuditLog } from './entities/configuration-audit-log.entity';

/**
 * @atom IA-PHASE3.7-002 ConfigurationService implements layered configuration pattern
 */
describe('ConfigurationService', () => {
  let service: ConfigurationService;
  let configRepo: jest.Mocked<Repository<SystemConfiguration>>;
  let auditRepo: jest.Mocked<Repository<ConfigurationAuditLog>>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  // Use real config key from agent.definitions.ts (snake_case)
  const mockSystemConfig: Partial<SystemConfiguration> = {
    id: 'config-uuid-1',
    domain: 'agent' as ConfigDomain,
    key: 'atomization_temperature',
    value: 0.9,
    valueType: 'number',
    description: 'Temperature for atomization analysis',
    updatedAt: new Date(),
    updatedBy: 'admin',
  };

  beforeEach(async () => {
    const mockConfigRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };

    const mockAuditRepo = {
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigurationService,
        {
          provide: getRepositoryToken(SystemConfiguration),
          useValue: mockConfigRepo,
        },
        {
          provide: getRepositoryToken(ConfigurationAuditLog),
          useValue: mockAuditRepo,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<ConfigurationService>(ConfigurationService);
    configRepo = module.get(getRepositoryToken(SystemConfiguration));
    auditRepo = module.get(getRepositoryToken(ConfigurationAuditLog));
    eventEmitter = module.get(EventEmitter2);
  });

  describe('get', () => {
    it('should return database value when exists (highest priority)', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(mockSystemConfig as SystemConfiguration);

      // Act
      const result = await service.get<number>('agent', 'atomization_temperature');

      // Assert
      expect(result.value).toBe(0.9);
      expect(result.source).toBe('database');
    });

    it('should return environment value when no database value exists', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(null);
      process.env.AGENT_ATOMIZATION_TEMPERATURE = '0.8';

      // Act
      const result = await service.get<number>('agent', 'atomization_temperature');

      // Assert
      expect(result.value).toBe(0.8);
      expect(result.source).toBe('environment');

      // Cleanup
      delete process.env.AGENT_ATOMIZATION_TEMPERATURE;
    });

    it('should return code default when no database or environment value exists', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(null);

      // Act
      const result = await service.get<number>('agent', 'atomization_temperature');

      // Assert
      expect(result.value).toBe(0.2); // Code default from agent.definitions.ts
      expect(result.source).toBe('code');
    });

    it('should cache values for subsequent reads', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(mockSystemConfig as SystemConfiguration);

      // Act
      await service.get<number>('agent', 'atomization_temperature');
      await service.get<number>('agent', 'atomization_temperature');

      // Assert - should only query database once
      expect(configRepo.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('getWithMetadata', () => {
    it('should return full configuration metadata', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(mockSystemConfig as SystemConfiguration);

      // Act
      const result = await service.getWithMetadata<number>('agent', 'atomization_temperature');

      // Assert
      expect(result.domain).toBe('agent');
      expect(result.key).toBe('atomization_temperature');
      expect(result.valueType).toBe('number');
      expect(result.description).toBeDefined();
      expect(result.codeDefault).toBe(0.2);
      expect(result.isEditable).toBe(true);
    });

    it('should throw error for unknown configuration', async () => {
      // Act & Assert
      await expect(service.getWithMetadata('unknown', 'key')).rejects.toThrow(
        'Unknown configuration: unknown.key',
      );
    });
  });

  describe('set', () => {
    it('should create new configuration when none exists', async () => {
      // Arrange - first call for get(), second for findOne in set()
      configRepo.findOne
        .mockResolvedValueOnce(null) // get() call
        .mockResolvedValueOnce(null); // findOne in set()
      configRepo.create.mockReturnValue({
        ...mockSystemConfig,
        value: 0.8,
      } as SystemConfiguration);
      configRepo.save.mockResolvedValue({
        ...mockSystemConfig,
        value: 0.8,
      } as SystemConfiguration);

      // Act
      await service.set('agent', 'atomization_temperature', 0.8, 'test-user', 'Testing');

      // Assert
      expect(configRepo.create).toHaveBeenCalled();
      expect(configRepo.save).toHaveBeenCalled();
      expect(auditRepo.save).toHaveBeenCalled();
    });

    it('should update existing configuration', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(mockSystemConfig as SystemConfiguration);
      configRepo.save.mockResolvedValue({
        ...mockSystemConfig,
        value: 0.8,
      } as SystemConfiguration);

      // Act
      await service.set('agent', 'atomization_temperature', 0.8, 'test-user');

      // Assert
      expect(configRepo.save).toHaveBeenCalled();
      expect(auditRepo.save).toHaveBeenCalled();
    });

    it('should emit config.changed event', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(mockSystemConfig as SystemConfiguration);
      configRepo.save.mockResolvedValue({
        ...mockSystemConfig,
        value: 0.8,
      } as SystemConfiguration);

      // Act
      await service.set('agent', 'atomization_temperature', 0.8, 'test-user');

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'config.changed',
        expect.objectContaining({
          domain: 'agent',
          key: 'atomization_temperature',
          newValue: 0.8,
          source: 'database',
          changedBy: 'test-user',
        } as Partial<ConfigChangedEvent>),
      );
    });

    it('should validate value against min/max constraints', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(null);

      // Act & Assert - atomization_temperature max is 1
      await expect(service.set('agent', 'atomization_temperature', 5, 'test-user')).rejects.toThrow(
        'Value must be at most 1',
      );
    });

    it('should validate value against enum constraints', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(null);

      // Act & Assert - log_level must be one of: error, warn, info, debug, verbose
      await expect(
        service.set('observability', 'log_level', 'invalid', 'test-user'),
      ).rejects.toThrow('Value must be one of:');
    });

    it('should throw error for non-editable configurations', async () => {
      // Act & Assert - max_input_length is not editable
      await expect(service.set('safety', 'max_input_length', 999, 'test-user')).rejects.toThrow(
        'Configuration safety.max_input_length is not editable',
      );
    });

    it('should invalidate cache after set', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(mockSystemConfig as SystemConfiguration);
      configRepo.save.mockResolvedValue({
        ...mockSystemConfig,
        value: 0.8,
      } as SystemConfiguration);

      // Populate cache
      await service.get('agent', 'atomization_temperature');

      // Act
      await service.set('agent', 'atomization_temperature', 0.8, 'test-user');

      // Read again - should query database
      await service.get('agent', 'atomization_temperature');

      // Assert - calls: initial get, get in set(), findOne in set(), get after set
      expect(configRepo.findOne).toHaveBeenCalledTimes(4);
    });
  });

  describe('reset', () => {
    it('should delete database record and revert to default', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(mockSystemConfig as SystemConfiguration);

      // Act
      await service.reset('agent', 'atomization_temperature', 'test-user');

      // Assert
      expect(configRepo.remove).toHaveBeenCalled();
      expect(auditRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: null, // Indicates reset
          changeReason: 'Reset to default',
        }),
      );
    });

    it('should emit config.changed event with default value', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(mockSystemConfig as SystemConfiguration);

      // Act
      await service.reset('agent', 'atomization_temperature', 'test-user');

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'config.changed',
        expect.objectContaining({
          domain: 'agent',
          key: 'atomization_temperature',
          newValue: 0.2, // Code default
        }),
      );
    });

    it('should do nothing if no database record exists', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(null);

      // Act
      await service.reset('agent', 'atomization_temperature', 'test-user');

      // Assert
      expect(configRepo.remove).not.toHaveBeenCalled();
    });
  });

  describe('getAuditLog', () => {
    it('should return paginated audit log entries', async () => {
      // Arrange
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'audit-1',
            domain: 'agent',
            key: 'atomization_temperature',
            oldValue: 0.7,
            newValue: 0.9,
            changedBy: 'admin',
            changedAt: new Date(),
          },
        ]),
      };
      auditRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      // Act
      const result = await service.getAuditLog({ limit: 10, offset: 0 });

      // Assert
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should apply domain filter when provided', async () => {
      // Arrange
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      };
      auditRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      // Act
      await service.getAuditLog({ domain: 'agent' });

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('log.domain = :domain', {
        domain: 'agent',
      });
    });
  });

  describe('getAllByDomain', () => {
    it('should return all configurations for a domain', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getAllByDomain('agent');

      // Assert
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((c) => c.domain === 'agent')).toBe(true);
    });
  });

  describe('getAll', () => {
    it('should return all configurations grouped by domain', async () => {
      // Arrange
      configRepo.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getAll();

      // Assert
      expect(result).toHaveProperty('agent');
      expect(result).toHaveProperty('resilience');
      expect(result).toHaveProperty('safety');
      expect(result).toHaveProperty('observability');
      expect(result).toHaveProperty('features');
    });
  });

  describe('environment variable parsing', () => {
    afterEach(() => {
      delete process.env.AGENT_ATOMIZATION_TEMPERATURE;
      delete process.env.CIRCUIT_BREAKER_ENABLED;
    });

    it('should parse number environment variables', async () => {
      // Arrange
      process.env.AGENT_ATOMIZATION_TEMPERATURE = '0.5';
      configRepo.findOne.mockResolvedValue(null);

      // Act
      const result = await service.get<number>('agent', 'atomization_temperature');

      // Assert
      expect(result.value).toBe(0.5);
      expect(typeof result.value).toBe('number');
    });

    it('should parse boolean environment variables', async () => {
      // Arrange
      process.env.CIRCUIT_BREAKER_ENABLED = 'true';
      configRepo.findOne.mockResolvedValue(null);

      // Act
      const result = await service.get<boolean>('resilience', 'circuit_breaker_enabled');

      // Assert
      expect(result.value).toBe(true);
      expect(typeof result.value).toBe('boolean');
    });
  });
});
