import { Test, TestingModule } from '@nestjs/testing';
import { ConfigurationController } from './configuration.controller';
import { ConfigurationService } from '../../common/configuration';
import { BadRequestException, NotFoundException } from '@nestjs/common';

/**
 * @atom IA-PHASE3.7-001 Configuration CRUD endpoints work correctly
 */
describe('ConfigurationController', () => {
  let controller: ConfigurationController;
  let configService: jest.Mocked<ConfigurationService>;

  // Use a real configuration key that exists in definitions (snake_case)
  const mockConfigValue = {
    domain: 'agent',
    key: 'atomization_temperature', // Real key from agent.definitions.ts
    value: 0.2,
    valueType: 'number' as const,
    source: 'database' as const,
    description: 'Temperature for atomization analysis',
    category: 'temperature',
    envVarName: 'AGENT_ATOMIZATION_TEMPERATURE',
    codeDefault: 0.2,
    validation: { min: 0, max: 1 },
    requiresRestart: false,
    isSensitive: false,
    isEditable: true,
    effectiveAt: new Date(),
  };

  const mockConfigService = {
    getAll: jest.fn(),
    getAllByDomain: jest.fn(),
    getWithMetadata: jest.fn(),
    set: jest.fn(),
    reset: jest.fn(),
    getAuditLog: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfigurationController],
      providers: [
        {
          provide: ConfigurationService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<ConfigurationController>(ConfigurationController);
    configService = module.get(ConfigurationService);
  });

  describe('getAllConfigurations', () => {
    it('should return all configurations grouped by domain', async () => {
      // Arrange
      const allConfigs = {
        agent: [mockConfigValue],
        resilience: [],
        safety: [],
        observability: [],
        features: [],
      };
      mockConfigService.getAll.mockResolvedValue(allConfigs);

      // Act
      const result = await controller.getAllConfigurations();

      // Assert
      expect(configService.getAll).toHaveBeenCalled();
      expect(result.agent).toHaveLength(1);
      expect(result.agent[0]).toEqual(mockConfigValue);
    });
  });

  describe('getByDomain', () => {
    it('should return configurations for a valid domain', async () => {
      // Arrange
      mockConfigService.getAllByDomain.mockResolvedValue([mockConfigValue]);

      // Act
      const result = await controller.getByDomain('agent');

      // Assert
      expect(configService.getAllByDomain).toHaveBeenCalledWith('agent');
      expect(result.domain).toBe('agent');
      expect(result.configs).toHaveLength(1);
    });

    it('should throw NotFoundException for invalid domain', async () => {
      // Act & Assert
      await expect(controller.getByDomain('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getValue', () => {
    it('should return a configuration value with metadata', async () => {
      // Arrange
      mockConfigService.getWithMetadata.mockResolvedValue(mockConfigValue);

      // Act
      const result = await controller.getValue('agent', 'atomization_temperature');

      // Assert
      expect(configService.getWithMetadata).toHaveBeenCalledWith(
        'agent',
        'atomization_temperature',
      );
      expect(result).toEqual(mockConfigValue);
    });

    it('should throw NotFoundException for unknown configuration', async () => {
      // Act & Assert
      await expect(controller.getValue('agent', 'nonexistent-key-xyz')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setValue', () => {
    it('should set a configuration value', async () => {
      // Arrange
      const updatedConfig = { ...mockConfigValue, value: 0.9 };
      mockConfigService.set.mockResolvedValue(updatedConfig);

      // Act
      const result = await controller.setValue(
        'agent',
        'atomization_temperature',
        { value: 0.9, reason: 'Testing' },
        'test-user',
      );

      // Assert
      expect(configService.set).toHaveBeenCalledWith(
        'agent',
        'atomization_temperature',
        0.9,
        'test-user',
        'Testing',
      );
      expect(result.value).toBe(0.9);
    });

    it('should use "admin" as default user', async () => {
      // Arrange
      mockConfigService.set.mockResolvedValue(mockConfigValue);

      // Act
      await controller.setValue('agent', 'atomization_temperature', { value: 0.7 });

      // Assert
      expect(configService.set).toHaveBeenCalledWith(
        'agent',
        'atomization_temperature',
        0.7,
        'admin',
        undefined,
      );
    });

    it('should throw NotFoundException for unknown configuration', async () => {
      // Act & Assert
      await expect(
        controller.setValue('agent', 'nonexistent-key-xyz', { value: 0.5 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for non-editable configuration', async () => {
      // Act & Assert - max_input_length is not editable (isEditable: false)
      await expect(
        controller.setValue('safety', 'max_input_length', { value: 100000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when service throws', async () => {
      // Arrange
      mockConfigService.set.mockRejectedValue(new Error('Validation failed'));

      // Act & Assert
      await expect(
        controller.setValue('agent', 'atomization_temperature', { value: 5 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resetToDefault', () => {
    it('should reset a configuration to default', async () => {
      // Arrange
      const resetConfig = { ...mockConfigValue, source: 'code' as const };
      mockConfigService.reset.mockResolvedValue(resetConfig);

      // Act
      const result = await controller.resetToDefault(
        'agent',
        'atomization_temperature',
        'test-user',
      );

      // Assert
      expect(configService.reset).toHaveBeenCalledWith(
        'agent',
        'atomization_temperature',
        'test-user',
      );
      expect(result.source).toBe('code');
    });

    it('should throw NotFoundException for unknown configuration', async () => {
      // Act & Assert
      await expect(controller.resetToDefault('agent', 'nonexistent-key-xyz')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAuditLog', () => {
    it('should return audit log entries', async () => {
      // Arrange
      const auditResult = {
        items: [
          {
            id: 'audit-1',
            domain: 'agent',
            key: 'atomization_temperature',
            oldValue: 0.7,
            newValue: 0.9,
            changedBy: 'test-user',
            changedAt: new Date(),
            changeReason: 'Testing',
          },
        ],
        total: 1,
      };
      mockConfigService.getAuditLog.mockResolvedValue(auditResult);

      // Act
      const result = await controller.getAuditLog({ limit: 50, offset: 0 });

      // Assert
      expect(configService.getAuditLog).toHaveBeenCalledWith({
        domain: undefined,
        key: undefined,
        changedBy: undefined,
        startDate: undefined,
        endDate: undefined,
        limit: 50,
        offset: 0,
      });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should apply filters to audit log query', async () => {
      // Arrange
      mockConfigService.getAuditLog.mockResolvedValue({ items: [], total: 0 });

      // Act
      await controller.getAuditLog({
        domain: 'agent',
        key: 'atomization_temperature',
        changedBy: 'admin',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        limit: 10,
        offset: 5,
      });

      // Assert
      expect(configService.getAuditLog).toHaveBeenCalledWith({
        domain: 'agent',
        key: 'atomization_temperature',
        changedBy: 'admin',
        startDate: expect.any(Date),
        endDate: expect.any(Date),
        limit: 10,
        offset: 5,
      });
    });
  });

  describe('getDomains', () => {
    it('should return list of available domains', async () => {
      // Act
      const result = await controller.getDomains();

      // Assert
      expect(result.domains).toContain('agent');
      expect(result.domains).toContain('resilience');
      expect(result.domains).toContain('safety');
      expect(result.domains).toContain('observability');
      expect(result.domains).toContain('features');
    });
  });
});
