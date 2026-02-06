import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { InvariantConfig } from './invariant-config.entity';
import { CreateInvariantDto } from './dto/create-invariant.dto';
import { UpdateInvariantDto } from './dto/update-invariant.dto';
import { BUILTIN_INVARIANTS, isBuiltinInvariantId } from './builtin-invariants';

/**
 * Service for managing InvariantConfigs
 *
 * Handles CRUD operations for invariant configurations and seeds
 * built-in invariants on application startup.
 */
@Injectable()
export class InvariantsService implements OnModuleInit {
  private readonly logger = new Logger(InvariantsService.name);

  constructor(
    @InjectRepository(InvariantConfig)
    private readonly invariantRepository: Repository<InvariantConfig>,
  ) {}

  /**
   * Seed built-in invariants on module initialization
   */
  async onModuleInit(): Promise<void> {
    await this.seedBuiltinInvariants();
  }

  /**
   * Seed all built-in invariants if they don't exist
   */
  async seedBuiltinInvariants(): Promise<void> {
    this.logger.log('Checking for built-in invariants...');

    for (const invariant of BUILTIN_INVARIANTS) {
      const existing = await this.invariantRepository.findOne({
        where: {
          invariantId: invariant.invariantId,
          projectId: IsNull(),
          isBuiltin: true,
        },
      });

      if (!existing) {
        this.logger.log(`Seeding built-in invariant: ${invariant.invariantId}`);
        const config = this.invariantRepository.create({
          projectId: null,
          invariantId: invariant.invariantId,
          name: invariant.name,
          description: invariant.description,
          isEnabled: true,
          isBlocking: true,
          checkType: invariant.checkType,
          checkConfig: invariant.checkConfig,
          errorMessage: invariant.errorMessage,
          suggestionPrompt: invariant.suggestionPrompt,
          isBuiltin: true,
        });
        await this.invariantRepository.save(config);
      }
    }

    this.logger.log('Built-in invariants check complete');
  }

  /**
   * Create a new custom invariant
   */
  async create(dto: CreateInvariantDto): Promise<InvariantConfig> {
    // Prevent creating invariants with built-in IDs
    if (isBuiltinInvariantId(dto.invariantId)) {
      throw new BadRequestException(`Cannot create invariant with reserved ID: ${dto.invariantId}`);
    }

    // Check for duplicate invariantId in the same project
    const existing = await this.invariantRepository.findOne({
      where: {
        invariantId: dto.invariantId,
        projectId: dto.projectId ?? IsNull(),
      },
    });

    if (existing) {
      throw new BadRequestException(`Invariant ${dto.invariantId} already exists for this project`);
    }

    const config = this.invariantRepository.create({
      projectId: dto.projectId ?? null,
      invariantId: dto.invariantId,
      name: dto.name,
      description: dto.description,
      isEnabled: dto.isEnabled ?? true,
      isBlocking: dto.isBlocking ?? true,
      checkType: dto.checkType,
      checkConfig: dto.checkConfig ?? {},
      errorMessage: dto.errorMessage,
      suggestionPrompt: dto.suggestionPrompt ?? null,
      isBuiltin: false,
    });

    return this.invariantRepository.save(config);
  }

  /**
   * Find all invariants, optionally filtered by project
   */
  async findAll(projectId?: string): Promise<InvariantConfig[]> {
    if (projectId) {
      // Return project-specific configs plus global defaults
      return this.invariantRepository.find({
        where: [{ projectId }, { projectId: IsNull() }],
        order: { invariantId: 'ASC' },
      });
    }

    // Return all global defaults
    return this.invariantRepository.find({
      where: { projectId: IsNull() },
      order: { invariantId: 'ASC' },
    });
  }

  /**
   * Find enabled invariants for a project
   */
  async findEnabled(projectId?: string): Promise<InvariantConfig[]> {
    const all = await this.findAll(projectId);
    return all.filter((inv) => inv.isEnabled);
  }

  /**
   * Find a single invariant by ID
   */
  async findOne(id: string): Promise<InvariantConfig> {
    const config = await this.invariantRepository.findOne({
      where: { id },
    });

    if (!config) {
      throw new NotFoundException(`Invariant config with ID ${id} not found`);
    }

    return config;
  }

  /**
   * Find invariant by invariantId and project
   */
  async findByInvariantId(
    invariantId: string,
    projectId?: string,
  ): Promise<InvariantConfig | null> {
    // First check for project-specific config
    if (projectId) {
      const projectConfig = await this.invariantRepository.findOne({
        where: { invariantId, projectId },
      });
      if (projectConfig) {
        return projectConfig;
      }
    }

    // Fall back to global default
    return this.invariantRepository.findOne({
      where: { invariantId, projectId: IsNull() },
    });
  }

  /**
   * Update an invariant configuration
   */
  async update(id: string, dto: UpdateInvariantDto): Promise<InvariantConfig> {
    const config = await this.findOne(id);

    // Prevent changing checkType for built-in invariants
    if (config.isBuiltin && dto.checkType && dto.checkType !== config.checkType) {
      throw new ForbiddenException('Cannot change checkType for built-in invariants');
    }

    // Apply updates
    if (dto.name !== undefined) config.name = dto.name;
    if (dto.description !== undefined) config.description = dto.description;
    if (dto.isEnabled !== undefined) config.isEnabled = dto.isEnabled;
    if (dto.isBlocking !== undefined) config.isBlocking = dto.isBlocking;
    if (dto.checkType !== undefined) config.checkType = dto.checkType;
    if (dto.checkConfig !== undefined) {
      config.checkConfig = { ...config.checkConfig, ...dto.checkConfig };
    }
    if (dto.errorMessage !== undefined) config.errorMessage = dto.errorMessage;
    if (dto.suggestionPrompt !== undefined) {
      config.suggestionPrompt = dto.suggestionPrompt;
    }

    return this.invariantRepository.save(config);
  }

  /**
   * Delete a custom invariant (built-in invariants cannot be deleted)
   */
  async remove(id: string): Promise<void> {
    const config = await this.findOne(id);

    if (config.isBuiltin) {
      throw new ForbiddenException('Cannot delete built-in invariants');
    }

    await this.invariantRepository.remove(config);
  }

  /**
   * Enable an invariant
   */
  async enable(id: string): Promise<InvariantConfig> {
    return this.update(id, { isEnabled: true });
  }

  /**
   * Disable an invariant
   */
  async disable(id: string): Promise<InvariantConfig> {
    return this.update(id, { isEnabled: false });
  }

  /**
   * Copy a global invariant config for a specific project
   * This allows per-project customization of built-in invariants
   */
  async copyForProject(invariantId: string, projectId: string): Promise<InvariantConfig> {
    // Get the global default
    const globalConfig = await this.invariantRepository.findOne({
      where: { invariantId, projectId: IsNull() },
    });

    if (!globalConfig) {
      throw new NotFoundException(`Invariant ${invariantId} not found`);
    }

    // Check if project-specific config already exists
    const existing = await this.invariantRepository.findOne({
      where: { invariantId, projectId },
    });

    if (existing) {
      throw new BadRequestException(`Project-specific config for ${invariantId} already exists`);
    }

    // Create project-specific copy
    const projectConfig = this.invariantRepository.create({
      projectId,
      invariantId: globalConfig.invariantId,
      name: globalConfig.name,
      description: globalConfig.description,
      isEnabled: globalConfig.isEnabled,
      isBlocking: globalConfig.isBlocking,
      checkType: globalConfig.checkType,
      checkConfig: { ...globalConfig.checkConfig },
      errorMessage: globalConfig.errorMessage,
      suggestionPrompt: globalConfig.suggestionPrompt,
      isBuiltin: globalConfig.isBuiltin,
    });

    return this.invariantRepository.save(projectConfig);
  }
}
