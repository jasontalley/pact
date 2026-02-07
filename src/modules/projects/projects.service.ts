import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

/**
 * Service for managing Projects
 *
 * Projects are the top-level organizational unit in Pact.
 * Each project can have its own invariant configuration.
 */
@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  /**
   * Create a new Project
   */
  async create(dto: CreateProjectDto): Promise<Project> {
    const project = this.projectRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      settings: dto.settings ?? {},
      metadata: dto.metadata ?? {},
    });

    return this.projectRepository.save(project);
  }

  /**
   * Find all projects
   */
  async findAll(): Promise<Project[]> {
    return this.projectRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find a project by ID
   */
  async findOne(id: string): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    return project;
  }

  /**
   * Update an existing project
   */
  async update(id: string, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findOne(id);

    if (dto.name !== undefined) {
      project.name = dto.name;
    }
    if (dto.description !== undefined) {
      project.description = dto.description;
    }
    if (dto.settings !== undefined) {
      project.settings = { ...project.settings, ...dto.settings };
    }
    if (dto.metadata !== undefined) {
      project.metadata = { ...project.metadata, ...dto.metadata };
    }

    return this.projectRepository.save(project);
  }

  /**
   * Delete a project
   */
  async remove(id: string): Promise<void> {
    const project = await this.findOne(id);
    await this.projectRepository.remove(project);
  }

  /**
   * Get the default project, creating one if none exists.
   * Used for singleton settings like repository configuration.
   */
  async getOrCreateDefault(): Promise<Project> {
    const projects = await this.projectRepository.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });

    if (projects.length > 0) {
      return projects[0];
    }

    const project = this.projectRepository.create({
      name: 'Default Project',
      description: 'Auto-created default project for Pact settings',
      settings: {},
      metadata: {},
    });

    return this.projectRepository.save(project);
  }

  /**
   * Check if a project exists
   */
  async exists(id: string): Promise<boolean> {
    const count = await this.projectRepository.count({
      where: { id },
    });
    return count > 0;
  }
}
