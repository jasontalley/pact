import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let service: ProjectsService;

  const mockProjectsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        {
          provide: ProjectsService,
          useValue: mockProjectsService,
        },
      ],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
    service = module.get<ProjectsService>(ProjectsService);
    jest.clearAllMocks();
  });

  describe('controller instantiation', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a new project', async () => {
      const createDto = { name: 'Test Project' };
      const expectedResult = {
        id: 'test-uuid',
        name: 'Test Project',
        description: null,
        settings: {},
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockProjectsService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(createDto);

      expect(result).toEqual(expectedResult);
      expect(mockProjectsService.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('findAll', () => {
    it('should return all projects', async () => {
      const projects = [
        { id: 'uuid-1', name: 'Project 1' },
        { id: 'uuid-2', name: 'Project 2' },
      ];

      mockProjectsService.findAll.mockResolvedValue(projects);

      const result = await controller.findAll();

      expect(result).toEqual(projects);
      expect(mockProjectsService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a project by ID', async () => {
      const project = { id: 'test-uuid', name: 'Test Project' };

      mockProjectsService.findOne.mockResolvedValue(project);

      const result = await controller.findOne('test-uuid');

      expect(result).toEqual(project);
      expect(mockProjectsService.findOne).toHaveBeenCalledWith('test-uuid');
    });

    it('should propagate NotFoundException from service', async () => {
      mockProjectsService.findOne.mockRejectedValue(new NotFoundException('Project not found'));

      await expect(controller.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a project', async () => {
      const updateDto = { name: 'Updated Name' };
      const updatedProject = {
        id: 'test-uuid',
        name: 'Updated Name',
      };

      mockProjectsService.update.mockResolvedValue(updatedProject);

      const result = await controller.update('test-uuid', updateDto);

      expect(result).toEqual(updatedProject);
      expect(mockProjectsService.update).toHaveBeenCalledWith('test-uuid', updateDto);
    });
  });

  describe('remove', () => {
    it('should remove a project', async () => {
      mockProjectsService.remove.mockResolvedValue(undefined);

      await controller.remove('test-uuid');

      expect(mockProjectsService.remove).toHaveBeenCalledWith('test-uuid');
    });
  });
});
