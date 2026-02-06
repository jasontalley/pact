# Molecules Module

Manages molecules - human-friendly groupings of Intent Atoms that provide descriptive lenses for understanding the system.

## Overview

**Key Principle**: Molecules are lenses, not truth. The system IS the composition of atoms; molecules help humans understand how atoms relate.

Characteristics:
- Molecules never change atom meaning - they just group atoms
- Molecules never define commitment - that belongs to atoms
- Computed metrics only - coverage, quality derived from atoms
- Orphan atoms are allowed - atoms can exist without molecules
- Multiple membership - atoms can belong to multiple molecules

## Entity: Molecule

```typescript
interface Molecule {
  id: string;              // UUID
  moleculeId: string;      // Sequential ID: "M-001", "M-002", etc.
  name: string;            // Human-readable name
  description: string;     // Markdown-enabled description

  // Lens type determines UI display
  lensType: LensType;      // user_story, feature, journey, epic, etc.
  lensLabel: string | null; // Custom label when lensType is 'custom'

  // Hierarchy (max depth: 10)
  parentMoleculeId: string | null;

  // Organization
  ownerId: string;
  tags: string[];
  metadata: Record<string, unknown>;
}
```

## Lens Types

Molecules support familiar product development concepts:

| Lens Type | Label | Description |
|-----------|-------|-------------|
| `user_story` | User Story | "As a [user], I want [goal] so that [benefit]" |
| `feature` | Feature | Distinct piece of functionality |
| `journey` | User Journey | Sequence of interactions to accomplish a goal |
| `epic` | Epic | Large body of work, broken into smaller pieces |
| `release` | Release | Collection of features for a specific version |
| `capability` | Capability | High-level ability the system provides |
| `custom` | Custom | User-defined grouping with custom label |

## Junction Table: MoleculeAtom

Atoms are linked to molecules via a junction table with ordering and soft delete:

```typescript
interface MoleculeAtom {
  moleculeId: string;
  atomId: string;
  order: number;           // Display order within molecule
  note: string | null;     // Context-specific note
  addedAt: Date;
  addedBy: string;
  removedAt: Date | null;  // Soft delete
  removedBy: string | null;
}
```

## Hierarchy

Molecules support parent-child relationships with a maximum depth of 10 levels:

```
Epic
├── Feature A
│   ├── User Story 1
│   └── User Story 2
└── Feature B
    └── User Story 3
```

Cycle detection and depth limits are enforced at the service layer.

## Computed Metrics

Metrics are derived from constituent atoms (never stored):

```typescript
interface MoleculeMetrics {
  atomCount: number;
  validatorCoverage: number;     // % of atoms with validators
  verificationHealth: number;    // % of validators passing
  realizationStatus: {
    draft: number;
    committed: number;
    superseded: number;
    overall: 'unrealized' | 'partial' | 'realized';
  };
  aggregateQuality: {
    average: number;
    min: number | null;
    max: number | null;
  };
  childMoleculeCount: number;
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/molecules` | List molecules with pagination/filtering |
| GET | `/molecules/:id` | Get single molecule |
| GET | `/molecules/moleculeId/:moleculeId` | Get by moleculeId (e.g., "M-001") |
| POST | `/molecules` | Create new molecule |
| PATCH | `/molecules/:id` | Update molecule |
| DELETE | `/molecules/:id` | Delete molecule (doesn't delete atoms) |
| GET | `/molecules/:id/atoms` | Get atoms in molecule |
| POST | `/molecules/:id/atoms` | Add atom to molecule |
| POST | `/molecules/:id/atoms/batch` | Batch add atoms |
| DELETE | `/molecules/:id/atoms/:atomId` | Remove atom (soft delete) |
| PUT | `/molecules/:id/atoms/reorder` | Reorder atoms |
| GET | `/molecules/:id/children` | Get child molecules |
| GET | `/molecules/:id/ancestors` | Get ancestor chain |
| GET | `/molecules/:id/metrics` | Get computed metrics |
| GET | `/molecules/orphan-atoms` | Get atoms not in any molecule |
| GET | `/molecules/statistics` | Get molecule statistics |
| GET | `/molecules/lens-types` | Get available lens types |

## Service Methods

```typescript
class MoleculesService {
  // CRUD
  create(dto: CreateMoleculeDto, userId: string): Promise<Molecule>;
  findAll(options: MoleculeSearchDto): Promise<PaginatedResponse>;
  findOne(id: string): Promise<Molecule>;
  findByMoleculeId(moleculeId: string): Promise<Molecule>;
  update(id: string, dto: UpdateMoleculeDto): Promise<Molecule>;
  remove(id: string): Promise<void>;

  // Atom management
  addAtom(moleculeId: string, dto: AddAtomDto, userId: string): Promise<MoleculeAtom>;
  batchAddAtoms(moleculeId: string, dto: BatchAddDto, userId: string): Promise<MoleculeAtom[]>;
  removeAtom(moleculeId: string, atomId: string, userId: string): Promise<void>;
  reorderAtoms(moleculeId: string, dto: ReorderDto): Promise<void>;
  getAtoms(moleculeId: string, options?: GetAtomsOptions): Promise<Atom[]>;

  // Hierarchy
  getChildren(moleculeId: string): Promise<Molecule[]>;
  getAncestors(moleculeId: string): Promise<Molecule[]>;

  // Metrics
  getMetrics(moleculeId: string): Promise<MoleculeMetrics>;
  getOrphanAtoms(): Promise<Atom[]>;
  getStatistics(): Promise<MoleculeStatistics>;
  getMoleculesForAtom(atomId: string): Promise<Molecule[]>;

  // Metadata
  getLensTypes(): LensTypeInfo[];
}
```

## File Structure

```
molecules/
├── molecule.entity.ts        # Molecule TypeORM entity
├── molecule-atom.entity.ts   # Junction table entity
├── molecules.controller.ts   # REST API endpoints
├── molecules.service.ts      # Business logic
├── molecules.repository.ts   # Database queries
├── molecules.module.ts       # NestJS module
├── dto/
│   ├── create-molecule.dto.ts
│   ├── update-molecule.dto.ts
│   ├── molecule-search.dto.ts
│   ├── add-atom.dto.ts
│   └── index.ts
└── molecules.service.spec.ts # Unit tests
```

## Usage Example

```typescript
// Create a molecule
const feature = await moleculesService.create({
  name: 'User Authentication',
  lensType: 'feature',
  description: 'Users can securely authenticate',
}, userId);

// Add atoms
await moleculesService.batchAddAtoms(feature.id, {
  atoms: [
    { atomId: atom1.id, order: 0 },
    { atomId: atom2.id, order: 1, note: 'Core login flow' },
  ]
}, userId);

// Get computed metrics
const metrics = await moleculesService.getMetrics(feature.id);
// { atomCount: 2, realizationStatus: { overall: 'partial' }, ... }
```

## Related Modules

- **atoms** - The building blocks that molecules group
- **commitments** - Links to molecules for commitment context
- **agents** - Reconciliation agent synthesizes molecules

## See Also

- [CLAUDE.md - Molecules](/CLAUDE.md#molecules-commitment-artifacts)
