# Pact Implementation Checklist - Phase 4

**Created**: 2026-01-29
**Based on**: Phase 3 completion + Molecule design decisions (ChatGPT feedback rounds 1 & 2)
**Status**: Planning

---

## Phase 4: Molecules (Intent Composition)

**Goal**: Users can organize Intent Atoms into human-friendly groupings called "Molecules" (displayed as "Views" or "Lenses" in UI). Molecules provide organizational structure while respecting atoms as the source of truth.

**Timeline**: Development Milestone 4 (Weeks 10-12 relative to project start)

**Dependencies**: Phase 3 complete (Commitments & Invariants operational)

**Key Deliverables** (Phase 4 Core):

- Molecule CRUD API (create, read, update, delete)
- Multiple lens types (User Stories, Features, Journeys, Epics, Releases, Capabilities)
- Hierarchical molecule support (optional parent-child relationships)
- Computed molecule metrics from constituent atoms
- Basic Molecule UI with lens-based navigation
- Atom-to-molecule association management
- Orphan atoms view

---

## Design Principles (From UX Spec & Design Decisions)

### Core Principles

1. **Molecules are Lenses, Not Truth**: Atoms are the source of truth. Molecules are mutable projections for human cognition.

2. **Molecules Never Change Atom Meaning**: A molecule groups atoms; it doesn't modify their semantics.

3. **Molecules Never Define Commitment**: Commitment belongs to atoms. Molecules have no commitment state.

4. **Computed Metrics Only**: Coverage, realization, quality are all computed from atoms—never declared.

5. **Validators Belong to Atoms**: Validators attach to atoms, not molecules. Molecule quality is aggregated.

6. **Orphan Atoms Allowed**: Atoms can exist without belonging to any molecule. This is normal.

7. **Multiple Membership**: Atoms can belong to multiple molecules simultaneously.

### UI Terminology

- Display as **"Views"** or **"Lenses"** in the UI (not "molecule")
- Use familiar product terminology: **User Stories**, **User Journeys**, **Features**, **Epics**, **Releases**, **Capabilities**

### Critical Boundary: What Molecules Must NOT Do

> "Molecules never change the meaning of atoms. Molecules never define commitment; atoms do. Molecules are optimized for human cognition; atoms are optimized for machine verification."

---

## Phase Structure

This phase is split into **Phase 4 Core** (must ship) and **Phase 4.5** (operational nice-to-haves) to keep the initial implementation lean.

### Phase 4 Core (This Document)
- Molecule entity (minimal fields)
- MoleculeAtom junction (order, addedBy/addedAt, note)
- CRUD + add/remove/reorder atoms
- Basic list + detail UI
- Orphan atoms view
- Computed fields (no caching initially)
- E2E tests for CRUD + composition

### Phase 4.5 / Phase 5 (Deferred)
- WebSocket events for real-time updates
- Redis caching + invalidation
- Molecule canvas view + canvasPosition
- Color/icon/tagging polish
- Publish/archive workflow (requires user/team governance)
- `primaryMoleculeId` on atoms (if needed at all)

---

## Part 1: Molecule Data Model

### 1.1 Molecule Entity (Minimal)

**Location**: `src/modules/molecules/molecule.entity.ts`

- [ ] Create `Molecule` entity with TypeORM decorators
  - [ ] `id` UUID (primary key)
  - [ ] `moleculeId` VARCHAR(20) unique (M-001 pattern)
  - [ ] `name` VARCHAR(255) (human-readable name)
  - [ ] `description` TEXT (markdown-enabled description)
  - [ ] `lensType` ENUM (user_story, feature, journey, epic, release, capability, custom)
  - [ ] `lensLabel` VARCHAR(100) nullable (custom display label when lensType='custom')
  - [ ] `parentMoleculeId` UUID nullable (for hierarchy)
  - [ ] `ownerId` VARCHAR(255) (creator identifier - simple string for now)
  - [ ] `tags` JSONB (array of strings for filtering)
  - [ ] `metadata` JSONB (extensible)
  - [ ] `createdAt` TIMESTAMP
  - [ ] `updatedAt` TIMESTAMP
- [ ] Add self-referential `parentMolecule` ManyToOne relation
- [ ] Add `childMolecules` OneToMany relation
- [ ] Add `moleculeAtoms` OneToMany relation (via junction entity)
- [ ] Create indexes on: moleculeId, lensType, ownerId, parentMoleculeId
- [ ] Write unit tests for entity
- [ ] Verify: Entity compiles and validates

**Deferred to Phase 4.5:**
- `status` ENUM (draft, published, archived) - requires user/team governance
- `maintainers` JSONB - requires auth system
- `canvasPosition` JSONB - requires canvas view
- `color` VARCHAR(7) - polish
- `icon` VARCHAR(50) - polish

### 1.2 MoleculeAtom Junction Table

**Location**: `src/modules/molecules/molecule-atom.entity.ts`

- [ ] Create `MoleculeAtom` junction entity
  - [ ] `moleculeId` UUID (FK to Molecule)
  - [ ] `atomId` UUID (FK to Atom)
  - [ ] `order` INTEGER (display order within molecule)
  - [ ] `note` TEXT nullable (context for why atom is in molecule)
  - [ ] `addedAt` TIMESTAMP
  - [ ] `addedBy` VARCHAR(255) (who added the atom)
  - [ ] `removedAt` TIMESTAMP nullable (for composition history)
  - [ ] `removedBy` VARCHAR(255) nullable (who removed the atom)
  - [ ] Composite primary key: (moleculeId, atomId)
- [ ] Add ManyToOne relations to both Molecule and Atom
- [ ] Create indexes on: moleculeId, atomId, order
- [ ] Write unit tests for junction entity
- [ ] Verify: Junction table supports many-to-many correctly

**Note**: `removedAt`/`removedBy` enables composition history without relying on DB audit logs. When an atom is removed from a molecule, we soft-delete the junction row rather than hard-deleting.

### 1.3 Database Migration

**Location**: `src/migrations/17xxxxxxxx-AddMoleculesTable.ts`

- [ ] Create migration for `molecules` table
- [ ] Create migration for `molecule_atoms` junction table
- [ ] Add foreign key constraints:
  - [ ] `molecule.parentMoleculeId` → `molecule.id` (SET NULL on delete)
  - [ ] `molecule_atoms.moleculeId` → `molecule.id` (CASCADE on delete)
  - [ ] `molecule_atoms.atomId` → `atom.id` (**RESTRICT on delete** - prevent silent cascade)
- [ ] Add CHECK constraint to prevent hierarchy cycles (trigger-based)
- [ ] Add CHECK constraint for max hierarchy depth (recommend 10 levels)
- [ ] Run migration and verify schema
- [ ] Verify: Migration runs successfully

**Important**: Using RESTRICT on `atomId` deletion because:
- Atoms should be soft-deleted or superseded, not hard-deleted
- If an atom must be hard-deleted, composition history should be explicitly cleaned up
- Prevents silent cascading that erases composition history

### 1.4 Hierarchy Cycle Prevention

**Location**: `src/migrations/17xxxxxxxx-AddMoleculesTable.ts` (same migration)

- [ ] Create trigger function `prevent_molecule_cycle()`:
  ```sql
  -- Traverse ancestors to ensure no cycle would be created
  -- Raise exception if setting parentMoleculeId would create loop
  ```
- [ ] Create trigger `molecule_cycle_check` BEFORE INSERT OR UPDATE
- [ ] Create trigger function `enforce_max_depth()`:
  ```sql
  -- Count ancestors; raise exception if depth > 10
  ```
- [ ] Write tests for cycle prevention
- [ ] Write tests for max depth enforcement
- [ ] Verify: Cycles are prevented, max depth enforced

### 1.5 DTO Definitions

**Location**: `src/modules/molecules/dto/`

- [ ] Create `CreateMoleculeDto`
  - [ ] `name` (required, min 3 chars, max 255)
  - [ ] `description` (optional, max 5000 chars)
  - [ ] `lensType` (required, enum validation)
  - [ ] `lensLabel` (optional, max 100 chars - for custom lens types)
  - [ ] `parentMoleculeId` (optional, UUID)
  - [ ] `tags` (optional, array of strings)
- [ ] Create `UpdateMoleculeDto` (partial of CreateMoleculeDto)
- [ ] Create `MoleculeResponseDto` with computed fields
  - [ ] Include `atomCount`
  - [ ] Include `validatorCoverage` (% atoms with ≥1 active validator)
  - [ ] Include `verificationHealth` (% atoms whose validators are passing)
  - [ ] Include `realizationStatus` (computed from atom statuses)
  - [ ] Include `aggregateQualityScore`
  - [ ] Include `childMoleculeCount`
- [ ] Create `MoleculeSearchDto` for filtering
  - [ ] `lensType` (optional, enum or array)
  - [ ] `ownerId` (optional)
  - [ ] `parentMoleculeId` (optional, null = root level)
  - [ ] `hasAtoms` (optional boolean)
  - [ ] `tags` (optional, array)
  - [ ] `search` (optional, text search on name/description)
  - [ ] Pagination: `limit`, `offset`, `cursor`
  - [ ] Sorting: `sortBy`, `sortOrder`
- [ ] Create `AddAtomToMoleculeDto`
  - [ ] `atomId` (required, UUID)
  - [ ] `order` (optional, integer)
  - [ ] `note` (optional, text)
- [ ] Create `BatchAddAtomsDto`
  - [ ] `atoms` (array of {atomId, order?, note?})
- [ ] Create `ReorderAtomsDto`
  - [ ] `atomOrders` (array of {atomId, order})
- [ ] Create `GetAtomsQueryDto`
  - [ ] `includeChildMolecules` (boolean, default false) - composition closure
  - [ ] `includeAtomDependencies` (boolean, default false) - dependency closure (future)
  - [ ] `recursive` (boolean, default true when includeChildMolecules=true)
- [ ] Add class-validator decorators for all DTOs
- [ ] Write unit tests for DTO validation
- [ ] Verify: All DTOs validate correctly

---

## Part 2: Molecule CRUD API

### 2.1 MoleculesController

**Location**: `src/modules/molecules/molecules.controller.ts`

- [ ] Implement `POST /molecules` - Create molecule
- [ ] Implement `GET /molecules` - List molecules with filtering/pagination
- [ ] Implement `GET /molecules/:id` - Get single molecule with relations
- [ ] Implement `PATCH /molecules/:id` - Update molecule
- [ ] Implement `DELETE /molecules/:id` - Delete molecule (not atoms!)
- [ ] Implement `GET /molecules/:id/atoms` - Get atoms in molecule
  - [ ] Query param: `includeChildMolecules` (boolean)
  - [ ] Query param: `recursive` (boolean)
- [ ] Implement `POST /molecules/:id/atoms` - Add atom to molecule
- [ ] Implement `POST /molecules/:id/atoms:batch` - Batch add atoms
- [ ] Implement `DELETE /molecules/:id/atoms/:atomId` - Remove atom from molecule (soft delete junction)
- [ ] Implement `PATCH /molecules/:id/atoms:reorder` - Reorder atoms
- [ ] Implement `PATCH /molecules/:id/atoms:batchUpdate` - Batch update order + notes
- [ ] Implement `GET /molecules/:id/children` - Get child molecules
- [ ] Implement `GET /molecules/:id/ancestors` - Get ancestor chain
- [ ] Implement `GET /molecules/:id/metrics` - Get computed metrics
- [ ] Implement `GET /molecules/lens-types` - Get available lens types with descriptions
- [ ] Implement `GET /molecules/statistics` - Get aggregate statistics
- [ ] Implement `GET /molecules/orphan-atoms` - Get atoms not in any molecule
- [ ] Add Swagger/OpenAPI documentation for all endpoints
- [ ] Verify: All endpoints documented in Swagger UI

**Deferred to Phase 4.5:**
- `PATCH /molecules/:id/publish` - Publish molecule (requires governance)
- `PATCH /molecules/:id/archive` - Archive molecule (requires governance)

### 2.2 MoleculesService

**Location**: `src/modules/molecules/molecules.service.ts`

- [ ] Implement `create(dto: CreateMoleculeDto, userId: string)`
  - [ ] Generate moleculeId (M-XXX pattern)
  - [ ] Validate parentMoleculeId if provided (exists, no cycle)
  - [ ] Validate hierarchy depth (max 10)
  - [ ] Set ownerId from userId
- [ ] Implement `findAll(options: MoleculeSearchDto)` with pagination
- [ ] Implement `findOne(id: string)` with eager loading (atoms, parent, children)
- [ ] Implement `update(id: string, dto: UpdateMoleculeDto)`
  - [ ] Validate parentMoleculeId change doesn't create cycle
- [ ] Implement `remove(id: string)` - Unlinks atoms, doesn't delete them
- [ ] Implement `addAtom(moleculeId: string, dto: AddAtomToMoleculeDto, userId: string)`
- [ ] Implement `batchAddAtoms(moleculeId: string, dto: BatchAddAtomsDto, userId: string)`
- [ ] Implement `removeAtom(moleculeId: string, atomId: string, userId: string)`
  - [ ] Soft-delete: set removedAt, removedBy on junction row
- [ ] Implement `reorderAtoms(moleculeId: string, dto: ReorderAtomsDto)`
- [ ] Implement `getAtoms(moleculeId: string, options: GetAtomsQueryDto)`
  - [ ] Direct atoms only by default
  - [ ] If `includeChildMolecules=true`, recursively collect from children
- [ ] Implement `getChildren(moleculeId: string)`
- [ ] Implement `getAncestors(moleculeId: string)` - Returns chain to root
- [ ] Implement `getMetrics(moleculeId: string)` - Compute all metrics
- [ ] Implement `generateMoleculeId()` helper (M-XXX pattern)
- [ ] Implement `getOrphanAtoms()` - Atoms not in any active molecule
- [ ] Implement `getStatistics()` - Aggregate stats
  - [ ] Count by lens type
  - [ ] Average atoms per molecule
- [ ] Write unit tests for all service methods (target: 90%+ coverage)
- [ ] Verify: Service tests pass

### 2.3 MoleculesRepository

**Location**: `src/modules/molecules/molecules.repository.ts`

- [ ] Extend SelectQueryBuilder pattern from AtomsRepository
- [ ] Implement `findByLensType(lensType: LensType)`
- [ ] Implement `findByOwner(ownerId: string)`
- [ ] Implement `findRootMolecules()` - Where parentMoleculeId is null
- [ ] Implement `findByTags(tags: string[])` - JSONB query
- [ ] Implement `search(criteria: MoleculeSearchDto)` - Complex filtering
- [ ] Implement `getAtomCounts()` - For each molecule, count active atoms
- [ ] Implement `findMoleculesContainingAtom(atomId: string)`
- [ ] Implement `getOrphanAtomIds()` - Atoms not in any molecule
- [ ] Implement `getAncestorChain(moleculeId: string)` - Recursive CTE
- [ ] Implement `getDescendantIds(moleculeId: string)` - Recursive CTE
- [ ] Write unit tests for all repository methods
- [ ] Verify: Repository queries execute efficiently

### 2.4 MoleculesModule

**Location**: `src/modules/molecules/molecules.module.ts`

- [ ] Create MoleculesModule with proper imports/exports
- [ ] Import TypeOrmModule.forFeature([Molecule, MoleculeAtom])
- [ ] Import AtomsModule (for atom references)
- [ ] Provide MoleculesService, MoleculesRepository
- [ ] Export MoleculesService for use by other modules
- [ ] Add to AppModule imports
- [ ] Verify: Module loads correctly

---

## Part 3: Atom-Molecule Integration

### 3.1 Atom Controller Extensions

**Location**: `src/modules/atoms/atoms.controller.ts`

- [ ] Implement `GET /atoms/:id/molecules` - Get molecules containing atom
- [ ] Update `GET /atoms` to support molecule filters:
  - [ ] `moleculeId` filter (atoms in specific molecule)
  - [ ] `orphan=true` filter (atoms not in any molecule)
- [ ] Add Swagger documentation for new endpoints
- [ ] Verify: Atom-molecule endpoints work correctly

### 3.2 Atom Service Extensions

**Location**: `src/modules/atoms/atoms.service.ts`

- [ ] Implement `getMolecules(atomId: string)` - Get all molecules containing atom
- [ ] Update search to support molecule filtering
- [ ] Verify: Atom-molecule service integration works

**Deferred to Phase 4.5 (or possibly never):**
- `primaryMoleculeId` on Atom entity
  - Risk: Creates implied canonical organization that leaks everywhere
  - Alternative: "Pin molecule" in UI as user preference, not a field on atom
  - Alternative: "Suggested primary" computed client-side (most recent, most frequent)

---

## Part 4: Computed Molecule Metrics

### 4.1 Metric Definitions

| Metric | Definition | Computation |
|--------|------------|-------------|
| **Validator Coverage** | % of atoms with ≥1 active validator | `atoms_with_validators / total_atoms * 100` |
| **Verification Health** | % of atoms whose validators are passing | `atoms_passing / atoms_with_validators * 100` |
| **Realization Status** | Overall commitment state | `unrealized` (0% committed), `partial` (1-99%), `realized` (100%) |
| **Aggregate Quality** | Average quality score | `sum(atom.qualityScore) / total_atoms` |

### 4.2 Metrics Computation Service

**Location**: `src/modules/molecules/molecules.service.ts`

- [ ] Implement `computeMetrics(moleculeId: string)`:
  - [ ] `atomCount`: Total atoms in molecule
  - [ ] `validatorCoverage`: % atoms with ≥1 active validator
  - [ ] `verificationHealth`: % atoms whose validators are passing (requires validator execution data)
  - [ ] `realizationStatus`: { draft: N, committed: N, superseded: N, overall: string }
  - [ ] `aggregateQuality`: { average: N, min: N, max: N }
- [ ] Handle transitive metrics (include child molecules) via optional flag
- [ ] Write unit tests for metric computation
- [ ] Verify: Metrics calculated correctly

**Note**: No caching in Phase 4 Core. Add Redis caching in Phase 4.5 when we understand access patterns.

---

## Part 5: Molecule UI (Frontend)

### 5.1 TypeScript Types

**Location**: `frontend/types/molecule.ts`

- [ ] Create `Molecule` interface matching backend entity
- [ ] Create `MoleculeAtom` junction interface
- [ ] Create `LensType` enum with display labels:
  ```typescript
  export const LENS_TYPE_LABELS: Record<LensType, string> = {
    user_story: 'User Story',
    feature: 'Feature',
    journey: 'User Journey',
    epic: 'Epic',
    release: 'Release',
    capability: 'Capability',
    custom: 'Custom',
  };
  ```
- [ ] Create `CreateMoleculeDto` interface
- [ ] Create `UpdateMoleculeDto` interface
- [ ] Create `MoleculeSearchDto` interface
- [ ] Create `MoleculeWithMetrics` interface (includes computed fields)
- [ ] Create `MoleculeMetrics` interface
- [ ] Verify: Types align with backend

### 5.2 API Client Methods

**Location**: `frontend/lib/api/molecules.ts`

- [ ] Implement `getMolecules(params?: MoleculeSearchDto)`
- [ ] Implement `getMolecule(id: string)`
- [ ] Implement `createMolecule(dto: CreateMoleculeDto)`
- [ ] Implement `updateMolecule(id: string, dto: UpdateMoleculeDto)`
- [ ] Implement `deleteMolecule(id: string)`
- [ ] Implement `getMoleculeAtoms(id: string, options?: GetAtomsQueryDto)`
- [ ] Implement `addAtomToMolecule(moleculeId: string, dto: AddAtomToMoleculeDto)`
- [ ] Implement `batchAddAtoms(moleculeId: string, atoms: AddAtomToMoleculeDto[])`
- [ ] Implement `removeAtomFromMolecule(moleculeId: string, atomId: string)`
- [ ] Implement `reorderMoleculeAtoms(moleculeId: string, atomOrders: ...)`
- [ ] Implement `getMoleculeChildren(id: string)`
- [ ] Implement `getMoleculeMetrics(id: string)`
- [ ] Implement `getLensTypes()`
- [ ] Implement `getMoleculeStatistics()`
- [ ] Implement `getOrphanAtoms()`
- [ ] Verify: API client methods work correctly

### 5.3 React Query Hooks

**Location**: `frontend/hooks/molecules/`

- [ ] Create `use-molecules.ts`:
  - [ ] `useMolecules(filters?: MoleculeSearchDto)`
  - [ ] `useMolecule(id: string)`
  - [ ] `useMoleculeAtoms(id: string, options?: GetAtomsQueryDto)`
  - [ ] `useMoleculeChildren(id: string)`
  - [ ] `useMoleculeMetrics(id: string)`
  - [ ] `useOrphanAtoms()`
  - [ ] `useLensTypes()`
  - [ ] `useMoleculeStatistics()`
- [ ] Create `use-molecule-mutations.ts`:
  - [ ] `useCreateMolecule()`
  - [ ] `useUpdateMolecule()`
  - [ ] `useDeleteMolecule()`
  - [ ] `useAddAtomToMolecule()`
  - [ ] `useBatchAddAtoms()`
  - [ ] `useRemoveAtomFromMolecule()`
  - [ ] `useReorderMoleculeAtoms()`
- [ ] Implement optimistic updates for mutations
- [ ] Set up proper cache invalidation
- [ ] Write tests for hooks
- [ ] Verify: Hooks work correctly

### 5.4 Molecule List Component

**Location**: `frontend/components/molecules/MoleculeList.tsx`

- [ ] Create `MoleculeList.tsx` component
  - [ ] Display molecules with hierarchy (tree view or flat with indentation)
  - [ ] Show molecule name, lens type badge, atom count
  - [ ] Show validator coverage percentage bar
  - [ ] Support filtering by lens type, search
  - [ ] Support sorting by name, created date, atom count
- [ ] Create `MoleculeCard.tsx` for list items
  - [ ] Lens type icon/badge using familiar terminology
  - [ ] Atom count badge
  - [ ] Coverage indicator
  - [ ] Quick actions (edit, add atoms, delete)
- [ ] Implement empty state for no molecules
- [ ] Write component tests
- [ ] Verify: Molecule list renders correctly

### 5.5 Molecule Detail Page

**Location**: `frontend/app/molecules/[id]/page.tsx`

- [ ] Create molecule detail page with:
  - [ ] Header: name, lens type (using familiar label), owner
  - [ ] Description (markdown rendered)
  - [ ] Metrics: atom count, validator coverage, verification health, quality score
  - [ ] Tabs: Atoms, Children, Settings
- [ ] Atoms tab:
  - [ ] List of atoms in molecule (reorderable via drag-and-drop)
  - [ ] Add atom button (opens atom picker)
  - [ ] Remove atom action (with confirmation)
  - [ ] Toggle: include atoms from child molecules
- [ ] Children tab:
  - [ ] List of child molecules
  - [ ] Create child molecule action
- [ ] Settings tab:
  - [ ] Edit name, description
  - [ ] Change lens type
  - [ ] Change parent molecule
  - [ ] Manage tags
  - [ ] Delete molecule (with confirmation: "This will not delete atoms")
- [ ] Write page tests
- [ ] Verify: Detail page displays all data

### 5.6 Molecule Creation Dialog

**Location**: `frontend/components/molecules/CreateMoleculeDialog.tsx`

- [ ] Create dialog component with:
  - [ ] Name input (required)
  - [ ] Lens type selector (with familiar labels and descriptions)
  - [ ] Custom label input (when lens type = custom)
  - [ ] Description textarea (markdown-enabled)
  - [ ] Parent molecule selector (optional, hierarchical dropdown)
  - [ ] Tags input (autocomplete from existing)
  - [ ] Initial atoms selector (multi-select, optional)
- [ ] Form validation with Zod
- [ ] Submit creates molecule and optionally adds atoms
- [ ] Write component tests
- [ ] Verify: Creation flow works end-to-end

### 5.7 Atom Picker Component

**Location**: `frontend/components/molecules/AtomPicker.tsx`

- [ ] Create reusable atom picker for adding atoms to molecules
  - [ ] Search/filter atoms by description, category, tags
  - [ ] Show current molecule membership (which molecules contain this atom)
  - [ ] Multi-select mode
  - [ ] Option to exclude already-in-molecule atoms
- [ ] Show atom status, category, quality score
- [ ] Confirm selection action (batch add)
- [ ] Write component tests
- [ ] Verify: Atom picker works correctly

### 5.8 Lens Type Components

**Location**: `frontend/components/molecules/LensTypeBadge.tsx`

- [ ] Create `LensTypeBadge.tsx` with:
  - [ ] Icon per lens type
  - [ ] Color coding
  - [ ] Tooltip with description
- [ ] Define lens type metadata:
  - [ ] user_story: "User Story" - blue, icon: user
  - [ ] feature: "Feature" - purple, icon: puzzle
  - [ ] journey: "User Journey" - orange, icon: map
  - [ ] epic: "Epic" - cyan, icon: layers
  - [ ] release: "Release" - red, icon: tag
  - [ ] capability: "Capability" - green, icon: zap
  - [ ] custom: "Custom" - gray, icon: edit
- [ ] Verify: Badges render correctly

### 5.9 Orphan Atoms View

**Location**: `frontend/components/molecules/OrphanAtomsList.tsx`

- [ ] Create orphan atoms list component
  - [ ] Display atoms not in any molecule
  - [ ] Same filtering/sorting as regular atom list
  - [ ] Quick action: "Add to molecule" (opens molecule selector)
  - [ ] Bulk select + batch add to molecule
- [ ] Integrate into navigation sidebar
- [ ] Verify: Orphan atoms easily discoverable

### 5.10 Molecule Navigation

**Location**: `frontend/components/layout/MoleculeSidebar.tsx`

- [ ] Create molecule sidebar for main navigation
  - [ ] Tree view of molecules (hierarchical)
  - [ ] Lens type filter tabs
  - [ ] Search molecules
  - [ ] "Unfiled Atoms" section showing orphan atom count
  - [ ] Quick create molecule action
- [ ] Highlight currently selected molecule
- [ ] Collapsible sections
- [ ] Write component tests
- [ ] Verify: Sidebar navigation works correctly

---

## Part 6: Entry Point & Navigation

### 6.1 Molecule-First Entry Point

**Design Decision**: Molecule-first default entry point for human users.

- [ ] Update main navigation to show "Views" as primary entry
- [ ] Default landing shows molecule list/tree
- [ ] Add "All Atoms" option for atom-centric view
- [ ] Add "Unfiled Atoms" section prominently with count badge
- [ ] Preserve bimodal navigation (molecules ↔ atoms)

### 6.2 Navigation Integration

- [ ] Update `frontend/components/layout/Sidebar.tsx`:
  - [ ] Add "Views" section with molecule tree
  - [ ] Add lens type filter pills
  - [ ] Show orphan atom count
- [ ] Update app layout to support molecule selection state
- [ ] Implement breadcrumb navigation for molecule hierarchy
- [ ] Verify: Navigation flows smoothly

### 6.3 Deep Linking

- [ ] Support URL patterns:
  - [ ] `/molecules` - Molecule list
  - [ ] `/molecules/:id` - Molecule detail
  - [ ] `/molecules/:id/atoms` - Atoms in molecule
  - [ ] `/atoms?molecule=:id` - Filter atoms by molecule
  - [ ] `/atoms?orphan=true` - Orphan atoms only
- [ ] Sync navigation state with URL via nuqs
- [ ] Verify: Deep links work correctly

---

## Part 7: Integration & Testing

### 7.1 E2E Test Suite

**Location**: `test/molecules-crud.e2e-spec.ts`

- [ ] Test molecule CRUD operations:
  - [ ] Create molecule with all fields
  - [ ] Create molecule with custom lens type and label
  - [ ] List molecules with filters
  - [ ] Get single molecule
  - [ ] Update molecule
  - [ ] Delete molecule (verify atoms not deleted)
- [ ] Test atom-molecule association:
  - [ ] Add atom to molecule
  - [ ] Batch add atoms to molecule
  - [ ] Remove atom from molecule (verify soft delete)
  - [ ] Reorder atoms
  - [ ] Get molecules containing atom
- [ ] Test hierarchy:
  - [ ] Create child molecule
  - [ ] Get children
  - [ ] Get ancestors
  - [ ] Prevent cycle creation
  - [ ] Enforce max depth
- [ ] Test computed metrics:
  - [ ] Validator coverage
  - [ ] Realization status
  - [ ] Aggregate quality
- [ ] Test orphan atoms:
  - [ ] Get orphan atoms
  - [ ] Add orphan atom to molecule (no longer orphan)
- [ ] Verify: All E2E tests pass

### 7.2 Integration Tests

- [ ] Test MoleculesService → AtomsService integration
- [ ] Test computed metrics update on atom changes
- [ ] Test RESTRICT prevents atom deletion when in molecules
- [ ] Test cycle prevention at service and database levels
- [ ] Verify: Integration tests pass

### 7.3 Frontend Tests

- [ ] Write tests for MoleculeList component
- [ ] Write tests for MoleculeCard component
- [ ] Write tests for CreateMoleculeDialog
- [ ] Write tests for AtomPicker
- [ ] Write tests for OrphanAtomsList
- [ ] Write tests for molecule hooks
- [ ] Verify: Frontend test coverage >= 70%

### 7.4 Playwright E2E Tests

**Location**: `frontend/e2e/molecules.spec.ts`

- [ ] Test create molecule flow
- [ ] Test add atoms to molecule
- [ ] Test molecule detail page
- [ ] Test navigation between molecules and atoms
- [ ] Test orphan atoms view
- [ ] Test hierarchy navigation
- [ ] Verify: Playwright tests pass

---

## Part 8: Documentation & Polish

### 8.1 API Documentation

- [ ] Complete Swagger/OpenAPI specs for molecule endpoints
- [ ] Add request/response examples
- [ ] Document computed metrics (definitions, computation)
- [ ] Document relationship semantics
- [ ] Document batch operations
- [ ] Verify: Swagger UI shows all endpoints

### 8.2 User Documentation

**Location**: `docs/user-guide/organizing-with-views.md`

- [ ] Document molecule concepts:
  - [ ] What are Views/Lenses?
  - [ ] Lens types explained (using familiar terminology)
  - [ ] Hierarchy and nesting
  - [ ] Why atoms can belong to multiple views
- [ ] Document workflows:
  - [ ] Creating a view
  - [ ] Adding atoms to views
  - [ ] Using different lens types effectively
  - [ ] Finding unfiled atoms
  - [ ] Reorganizing atoms between views
- [ ] Add examples and screenshots
- [ ] Verify: User documentation complete

### 8.3 Developer Documentation

- [ ] Document molecule data model in `docs/schema.md`
- [ ] Document computed metric algorithms
- [ ] Document hierarchy constraints (cycle prevention, max depth)
- [ ] Document soft-delete pattern for junction rows
- [ ] Update CLAUDE.md with molecule conventions
- [ ] Verify: Developer docs up-to-date

---

## Phase 4 Core Success Criteria

- [ ] Users can create molecules with 7 lens types (using familiar labels)
- [ ] Users can organize atoms into molecules
- [ ] Molecules support hierarchical parent-child relationships (max 10 levels)
- [ ] Hierarchy cycles are prevented
- [ ] Validator coverage and realization status computed from atoms
- [ ] Aggregate quality scores visible on molecules
- [ ] Orphan atoms easily discoverable
- [ ] Atoms can belong to multiple molecules
- [ ] Removing atoms from molecules uses soft-delete (composition history)
- [ ] Deleting molecules does not delete atoms (RESTRICT enforces this)
- [ ] All E2E tests pass
- [ ] API documented in Swagger
- [ ] Frontend molecule UI operational

---

## Phase 4.5 (Deferred)

The following are explicitly deferred to keep Phase 4 Core lean:

### Operational Nice-to-haves

- [ ] WebSocket events for molecules (real-time updates)
- [ ] Redis caching for computed metrics
- [ ] Molecule canvas view (`canvasPosition` field)
- [ ] Color/icon customization
- [ ] Tagging polish (autocomplete, management UI)

### Governance Features (Require Auth/Teams)

- [ ] Molecule `status` (draft/published/archived)
- [ ] `/publish` and `/archive` endpoints
- [ ] `maintainers` field
- [ ] `primaryMoleculeId` on atoms (if ever needed)

### Advanced Features

- [ ] `includeAtomDependencies` flag (atom dependency closure)
- [ ] Molecule templates/presets
- [ ] Molecule export/import

---

## Validation Checklist (End of Phase 4)

Run these commands to validate Phase 4 completion:

```bash
# Backend tests
./scripts/test.sh --ci

# Frontend tests
cd frontend && npm test

# E2E tests
./scripts/test.sh --e2e

# API docs accessible
curl http://localhost:3000/api/docs

# Molecule endpoints work
curl http://localhost:3000/molecules
curl http://localhost:3000/molecules/lens-types
curl http://localhost:3000/molecules/orphan-atoms

# Frontend accessible
curl http://localhost:3001
```

Expected results:

- All tests pass
- Coverage >= 80% backend, >= 70% frontend
- API docs render correctly
- Molecule UI functional
- Lens types selectable with familiar labels
- Orphan atoms visible and easily actionable

---

## Key Invariants to Enforce

1. **Molecule deletion never deletes atoms** - RESTRICT FK + soft-delete pattern
2. **Atoms are truth, molecules are lenses** - No molecule fields affect atom behavior
3. **Computed metrics are read-only** - Coverage, status, quality derive from atoms
4. **Hierarchy is a strict tree** - No cycles, max 10 depth, single parent
5. **Composition history preserved** - Soft-delete junction rows with removedAt/removedBy

---

## Notes for Implementation

### Performance Considerations

1. **Atom count**: Query with COUNT, don't load all atoms
2. **Computed metrics**: Calculate on-demand in Phase 4, add caching in 4.5
3. **Tree queries**: Use recursive CTEs for hierarchy traversal
4. **Bulk operations**: Batch add/reorder endpoints prevent N chatty requests

### UI/UX Reminders

1. **Use "Views" or "Lenses" in UI** - Not "molecule"
2. **Use familiar terminology** - "User Story", "User Journey", "Feature", not enum values
3. **Emphasize atoms as truth** - Visual hierarchy shows atoms are fundamental
4. **Orphan atoms are normal** - Don't make users feel bad about unfiled atoms
5. **Easy recomposition** - Atoms should flow between molecules easily

---

**Last Updated**: 2026-01-29
