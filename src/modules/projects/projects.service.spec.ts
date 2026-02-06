import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Project } from './project.entity';

describe('ProjectsService', () => {
  let service: ProjectsService;

  const mockProjectRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepository,
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    jest.clearAllMocks();
  });

  describe('service instantiation', () => {
    it('should be instantiated by NestJS dependency injection', () => {
      expect(service).toBeDefined();
      expect(service).not.toBeNull();
      expect(service).toBeInstanceOf(ProjectsService);
    });
  });

  describe('create', () => {
    it('should create a new project with required fields', async () => {
      const createDto = {
        name: 'Test Project',
      };

      const savedProject = {
        id: 'test-uuid',
        name: 'Test Project',
        description: null,
        settings: {},
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockProjectRepository.create.mockReturnValue(savedProject);
      mockProjectRepository.save.mockResolvedValue(savedProject);

      const result = await service.create(createDto);

      expect(result.name).toBe('Test Project');
      expect(result.id).toBe('test-uuid');
      expect(mockProjectRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should create a project with all optional fields', async () => {
      const createDto = {
        name: 'Full Project',
        description: 'A project with all fields',
        settings: { enforceInvariants: true, qualityThreshold: 80 },
        metadata: { team: 'platform' },
      };

      const savedProject = {
        id: 'test-uuid-2',
        ...createDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockProjectRepository.create.mockReturnValue(savedProject);
      mockProjectRepository.save.mockResolvedValue(savedProject);

      const result = await service.create(createDto);

      expect(result.name).toBe('Full Project');
      expect(result.description).toBe('A project with all fields');
      expect(result.settings).toEqual({ enforceInvariants: true, qualityThreshold: 80 });
      expect(result.metadata).toEqual({ team: 'platform' });
    });
  });

  describe('findAll', () => {
    it('should return all projects ordered by createdAt descending', async () => {
      const projects = [
        { id: 'uuid-1', name: 'Project 1', createdAt: new Date('2026-01-21') },
        { id: 'uuid-2', name: 'Project 2', createdAt: new Date('2026-01-20') },
      ];

      mockProjectRepository.find.mockResolvedValue(projects);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(mockProjectRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array when no projects exist', async () => {
      mockProjectRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('should return a project by ID', async () => {
      const project = {
        id: 'test-uuid',
        name: 'Test Project',
        description: null,
        settings: {},
      };

      mockProjectRepository.findOne.mockResolvedValue(project);

      const result = await service.findOne('test-uuid');

      expect(result.id).toBe('test-uuid');
      expect(result.name).toBe('Test Project');
    });

    it('should throw NotFoundException when project does not exist', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent-uuid')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('non-existent-uuid')).rejects.toThrow(
        'Project with ID non-existent-uuid not found',
      );
    });
  });

  describe('update', () => {
    it('should update project name', async () => {
      const existingProject = {
        id: 'test-uuid',
        name: 'Old Name',
        description: null,
        settings: {},
        metadata: {},
      };

      mockProjectRepository.findOne.mockResolvedValue(existingProject);
      mockProjectRepository.save.mockResolvedValue({
        ...existingProject,
        name: 'New Name',
      });

      const result = await service.update('test-uuid', { name: 'New Name' });

      expect(result.name).toBe('New Name');
      expect(mockProjectRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should merge settings with existing settings', async () => {
      const existingProject = {
        id: 'test-uuid',
        name: 'Test Project',
        description: null,
        settings: { enforceInvariants: true },
        metadata: {},
      };

      mockProjectRepository.findOne.mockResolvedValue(existingProject);
      mockProjectRepository.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.update('test-uuid', {
        settings: { qualityThreshold: 90 },
      });

      expect(result.settings).toEqual({
        enforceInvariants: true,
        qualityThreshold: 90,
      });
    });

    it('should throw NotFoundException when updating non-existent project', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(service.update('non-existent-uuid', { name: 'New Name' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should remove a project', async () => {
      const project = {
        id: 'test-uuid',
        name: 'Test Project',
      };

      mockProjectRepository.findOne.mockResolvedValue(project);
      mockProjectRepository.remove.mockResolvedValue(undefined);

      await service.remove('test-uuid');

      expect(mockProjectRepository.remove).toHaveBeenCalledWith(project);
    });

    it('should throw NotFoundException when removing non-existent project', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('non-existent-uuid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('exists', () => {
    it('should return true when project exists', async () => {
      mockProjectRepository.count.mockResolvedValue(1);

      const result = await service.exists('test-uuid');

      expect(result).toBe(true);
    });

    it('should return false when project does not exist', async () => {
      mockProjectRepository.count.mockResolvedValue(0);

      const result = await service.exists('non-existent-uuid');

      expect(result).toBe(false);
    });
  });
});
