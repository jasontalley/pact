# Entities Module

Database entities for agent-related persistence.

## Overview

This module defines TypeORM entities for persisting reconciliation runs, inferred atoms, molecules, and test records. These entities support the reconciliation workflow and enable resumable, auditable agent operations.

## Entity Relationships

```text
ReconciliationRun (1) ──┬── (N) AtomRecommendation
                        │
                        ├── (N) MoleculeRecommendation
                        │
                        └── (N) TestRecord
```

## Entities

### ReconciliationRun

Tracks each execution of the reconciliation agent.

```typescript
@Entity('reconciliation_runs')
export class ReconciliationRun {
  id: string;                    // UUID
  projectId?: string;            // Associated project
  status: ReconciliationStatus;  // pending | analyzing | review | applying | completed | failed
  mode: 'full-scan' | 'delta';   // Analysis mode
  targetDirectory: string;       // Root directory analyzed
  config: ReconciliationConfig;  // Stored configuration
  summary?: ReconciliationSummary;  // Results summary
  error?: string;                // Error message if failed
  startedAt: Date;
  completedAt?: Date;
  createdBy: string;
}
```

**Statuses:**
- `pending` - Run created, not started
- `analyzing` - Graph executing
- `review` - Awaiting human review (NodeInterrupt)
- `applying` - Writing atoms to database
- `completed` - Successfully finished
- `failed` - Error occurred

### AtomRecommendation

Stores inferred atoms before they're committed.

```typescript
@Entity('atom_recommendations')
export class AtomRecommendation {
  id: string;                    // UUID
  runId: string;                 // Parent reconciliation run
  tempId: string;                // Temporary ID during processing
  description: string;           // Inferred atom description
  category: string;              // functional | performance | security | etc.
  confidence: number;            // 0-100 inference confidence
  qualityScore?: number;         // 0-100 quality validation score
  status: AtomRecommendationStatus;  // pending | approved | rejected | created
  sourceTestFile: string;        // Test that inspired this atom
  sourceTestName: string;        // Specific test name
  observableOutcomes?: ObservableOutcomeData[];
  falsifiabilityCriteria?: FalsifiabilityCriteriaData[];
  createdAtomId?: string;        // ID of created atom (after approval)
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewNotes?: string;
}
```

### MoleculeRecommendation

Stores inferred molecules (atom groupings).

```typescript
@Entity('molecule_recommendations')
export class MoleculeRecommendation {
  id: string;                    // UUID
  runId: string;                 // Parent reconciliation run
  tempId: string;                // Temporary ID during processing
  name: string;                  // Molecule name
  description: string;           // What this molecule represents
  confidence: number;            // 0-100 clustering confidence
  atomTempIds: string[];         // Constituent atom temp IDs
  clusteringMethod: string;      // How atoms were grouped
  status: MoleculeRecommendationStatus;
  createdMoleculeId?: string;    // ID of created molecule
  reviewedAt?: Date;
}
```

### TestRecord

Tracks each test analyzed during reconciliation.

```typescript
@Entity('test_records')
export class TestRecord {
  id: string;                    // UUID
  runId: string;                 // Parent reconciliation run
  filePath: string;              // Test file path
  testName: string;              // Test name
  lineNumber: number;            // Line number in file
  status: TestRecordStatus;      // orphan | linked | skipped
  linkedAtomId?: string;         // Existing @atom annotation
  recommendationId?: string;     // Associated recommendation (if orphan)
  analysisNotes?: string;        // Context from analysis
}
```

## Usage Patterns

### Creating a Run

```typescript
const run = await reconciliationRepository.createRun({
  projectId: 'project-123',
  mode: 'full-scan',
  targetDirectory: '/path/to/repo',
  config: { qualityThreshold: 80 },
  createdBy: 'user@example.com',
});
```

### Updating Run Status

```typescript
await reconciliationRepository.updateRunStatus(runId, 'analyzing');

// With summary on completion
await reconciliationRepository.completeRun(runId, {
  totalTests: 100,
  orphanTests: 15,
  atomsInferred: 12,
  moleculesInferred: 3,
});
```

### Storing Recommendations

```typescript
await reconciliationRepository.saveAtomRecommendations(runId, inferredAtoms);
await reconciliationRepository.saveMoleculeRecommendations(runId, inferredMolecules);
await reconciliationRepository.saveTestRecords(runId, testRecords);
```

### Querying

```typescript
// Get run with all recommendations
const run = await reconciliationRepository.findRunWithRecommendations(runId);

// Get pending recommendations for review
const pending = await reconciliationRepository.findPendingRecommendations(runId);

// Get run history for a project
const history = await reconciliationRepository.findRunsByProject(projectId);
```

## Migrations

Entities are managed by TypeORM migrations:

```bash
# Generate migration after entity changes
npm run migration:generate -- -n AddReconciliationEntities

# Run migrations
npm run migration:run
```

## Indexes

Key indexes for performance:

- `reconciliation_runs`: `(projectId, status)`, `(createdAt)`
- `atom_recommendations`: `(runId, status)`, `(tempId)`
- `molecule_recommendations`: `(runId, status)`
- `test_records`: `(runId, status)`, `(filePath)`

## See Also

- [Reconciliation Service](../reconciliation.service.ts)
- [Reconciliation Repository](../repositories/reconciliation.repository.ts)
- [Reconciliation Graph](../graphs/graphs/reconciliation.graph.ts)
