# Projects Module

Manages projects - the top-level organizational unit in Pact.

## Overview

Projects provide isolation and customization for different codebases or teams. Each project can have its own:

- Invariant configuration (enable/disable, blocking status)
- Quality thresholds
- Custom settings

## Entity: Project

```typescript
interface Project {
  id: string;              // UUID
  name: string;
  description: string | null;

  settings: ProjectSettings;

  createdAt: Date;
  updatedAt: Date;

  metadata: Record<string, unknown>;

  // Relations
  invariantConfigs: InvariantConfig[];
}

interface ProjectSettings {
  /** Whether to enforce invariants on commit */
  enforceInvariants?: boolean;

  /** Default quality threshold for atoms (0-100) */
  qualityThreshold?: number;

  /** Custom metadata */
  [key: string]: unknown;
}
```

## Features

### Per-Project Invariant Configuration

Each project can customize invariant behavior:

```typescript
// Copy global invariant for project customization
await invariantsService.copyForProject('INV-002', project.id);

// Now customize for this project
await invariantsService.update(configId, {
  isBlocking: false,        // Make it a warning
  checkConfig: {
    minQualityScore: 70     // Lower threshold for this project
  }
});
```

### Quality Threshold Override

Projects can set their own quality thresholds:

```typescript
const project = await projectsService.create({
  name: 'Legacy Migration',
  settings: {
    qualityThreshold: 60,     // Lower bar during migration
    enforceInvariants: true
  }
});
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | List all projects |
| GET | `/projects/:id` | Get single project |
| POST | `/projects` | Create project |
| PATCH | `/projects/:id` | Update project |
| DELETE | `/projects/:id` | Delete project |
| GET | `/projects/:id/invariants` | Get project's invariant configs |
| GET | `/projects/:id/statistics` | Get project statistics |

## Service Methods

```typescript
class ProjectsService {
  create(dto: CreateProjectDto): Promise<Project>;
  findAll(): Promise<Project[]>;
  findOne(id: string): Promise<Project>;
  update(id: string, dto: UpdateProjectDto): Promise<Project>;
  remove(id: string): Promise<void>;

  // Settings
  updateSettings(id: string, settings: Partial<ProjectSettings>): Promise<Project>;
  getEffectiveSettings(id: string): Promise<ProjectSettings>;
}
```

## File Structure

```
projects/
├── project.entity.ts        # TypeORM entity
├── projects.controller.ts   # REST API
├── projects.service.ts      # Business logic
├── projects.module.ts       # NestJS module
└── dto/
    ├── create-project.dto.ts
    └── update-project.dto.ts
```

## Default Project

If no project is specified, operations use a "default" global context:

- Invariants use global defaults (projectId: null)
- Quality threshold uses system default (80)

## Related Modules

- **invariants** - Per-project invariant configuration
- **commitments** - Commitments can be scoped to projects
- **atoms** - Future: atoms could be scoped to projects

## Future Enhancements

Planned features:
- Project-scoped atoms and molecules
- Team membership and permissions
- Project templates
- Cross-project atom sharing
