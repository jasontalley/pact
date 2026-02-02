# Atoms Module

Core module for managing Intent Atoms - the irreducible behavioral primitives of Pact.

## Overview

Intent Atoms are the atomic unit of committed intent. Each atom describes a single, testable behavior that is:

- **Observable** - Can be verified externally
- **Falsifiable** - Has clear failure conditions
- **Implementation-Agnostic** - Describes behavior, not how to implement it
- **Immutable after commitment** - Can only be superseded, never edited

## Entity: Atom

```typescript
interface Atom {
  id: string;              // UUID
  atomId: string;          // Sequential ID: "IA-001", "IA-002", etc.
  description: string;     // Behavioral description
  category: AtomCategory;  // functional, performance, security, etc.
  status: AtomStatus;      // draft, committed, superseded
  qualityScore: number;    // 0-100, must be >= 80 to commit

  // Quality dimensions
  observableOutcomes: ObservableOutcome[];
  falsifiabilityCriteria: FalsifiabilityCriterion[];

  // Organization
  tags: string[];
  canvasPosition: { x: number; y: number };

  // Traceability
  parentIntent: string;           // Original user input
  refinementHistory: RefinementRecord[];
  supersededBy: string | null;    // ID of superseding atom
}
```

## Status Lifecycle

```
draft ──commit()──> committed ──supersede()──> superseded
  │                     │
  │                     └─────────────────────┐
  │                                           │
  └──update()──> draft (can be updated)       │
                                              │
                          [new atom created] ◄┘
```

## Invariant Enforcement

The service enforces key invariants:

| Invariant | Description |
|-----------|-------------|
| INV-004 | Committed atoms are immutable - cannot be updated or deleted |
| Quality Gate | Atoms must have `qualityScore >= 80` to be committed |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/atoms` | List all atoms with pagination/filtering |
| GET | `/atoms/:id` | Get single atom by UUID |
| GET | `/atoms/atomId/:atomId` | Get atom by atomId (e.g., "IA-001") |
| POST | `/atoms` | Create new draft atom |
| PATCH | `/atoms/:id` | Update draft atom |
| DELETE | `/atoms/:id` | Delete draft atom |
| POST | `/atoms/:id/commit` | Commit atom (requires quality >= 80) |
| POST | `/atoms/:id/supersede` | Supersede with existing atom |
| POST | `/atoms/:id/supersede-with-new` | Create new atom and supersede |
| POST | `/atoms/:id/tags` | Add tag |
| DELETE | `/atoms/:id/tags/:tag` | Remove tag |
| GET | `/atoms/tags/popular` | Get popular tags |
| GET | `/atoms/statistics` | Get atom statistics |

## WebSocket Events

Real-time updates are emitted via `AtomsGateway`:

| Event | Payload | Trigger |
|-------|---------|---------|
| `atom:created` | `Atom` | New atom created |
| `atom:updated` | `Atom` | Draft atom updated |
| `atom:deleted` | `atomId` | Draft atom deleted |
| `atom:committed` | `Atom` | Atom committed |
| `atom:superseded` | `{ atomId, newAtomId }` | Atom superseded |

## Categories

Atoms are classified by category:

- **functional** - Core behavior and business logic
- **performance** - Speed, throughput, resource usage
- **security** - Access control, data protection
- **reliability** - Error handling, fault tolerance
- **usability** - User experience, accessibility
- **maintainability** - Code quality, extensibility

## ID Generation

Atom IDs follow the pattern `IA-{NNN}` where NNN is a zero-padded sequential number:

```typescript
// Examples: IA-001, IA-042, IA-999
const atomId = await this.generateAtomId();
```

## Service Methods

```typescript
class AtomsService {
  // CRUD
  create(dto: CreateAtomDto): Promise<Atom>;
  findAll(search?: AtomSearchDto): Promise<PaginatedAtomsResponse>;
  findOne(id: string): Promise<Atom>;
  findByAtomId(atomId: string): Promise<Atom>;
  update(id: string, dto: UpdateAtomDto): Promise<Atom>;
  remove(id: string): Promise<void>;

  // Lifecycle
  commit(id: string): Promise<Atom>;
  supersede(id: string, newAtomId: string): Promise<Atom>;
  supersedeWithNewAtom(id: string, dto: SupersedeAtomDto): Promise<SupersessionResult>;

  // Tags
  addTag(id: string, tag: string): Promise<Atom>;
  removeTag(id: string, tag: string): Promise<Atom>;
  getPopularTags(limit?: number): Promise<TagCount[]>;

  // Queries
  findByStatus(status: AtomStatus): Promise<Atom[]>;
  findByTags(tags: string[]): Promise<Atom[]>;
  findByCategory(category: AtomCategory): Promise<Atom[]>;
  findSupersessionChain(atomId: string): Promise<Atom[]>;
  getStatistics(): Promise<AtomStatistics>;
}
```

## File Structure

```
atoms/
├── atom.entity.ts          # TypeORM entity definition
├── atoms.controller.ts     # REST API endpoints
├── atoms.service.ts        # Business logic
├── atoms.repository.ts     # Database queries
├── atoms.module.ts         # NestJS module definition
├── dto/
│   ├── create-atom.dto.ts
│   ├── update-atom.dto.ts
│   ├── atom-search.dto.ts
│   └── supersede-atom.dto.ts
└── atoms.service.spec.ts   # Unit tests
```

## Related Modules

- **molecules** - Groups atoms into descriptive lenses
- **validators** - Links tests to atoms
- **commitments** - Creates immutable commitment artifacts
- **evidence** - Records test execution results

## See Also

- [CLAUDE.md - Intent Artifact Management](/CLAUDE.md#intent-artifact-management)
- [Agents Module](/src/modules/agents/README.md) - Reconciliation agent infers atoms
