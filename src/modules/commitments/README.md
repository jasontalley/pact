# Commitments Module

Manages CommitmentArtifacts - immutable records of committed intent.

## Overview

A Commitment Artifact is the central artifact of the Commitment Boundary. Once created, it cannot be modified - only superseded by a new commitment. This enforces the principle that committed intent is sacred.

## Invariant Enforcement

The commitment process enforces these global invariants:

| Invariant | Description |
|-----------|-------------|
| INV-001 | Explicit Commitment Required - committed_by must be human |
| INV-004 | Commitment Is Immutable - canonical_json unchangeable |
| INV-005 | Traceability Is Mandatory - links to atoms and molecule |
| INV-006 | Agents May Not Commit Intent - human authorization required |

## Entity: CommitmentArtifact

```typescript
interface CommitmentArtifact {
  id: string;              // UUID
  commitmentId: string;    // Sequential ID: "COM-001", "COM-002", etc.

  // Context
  projectId: string | null;
  moleculeId: string | null;

  // Immutable snapshot
  canonicalJson: CanonicalAtomSnapshot[];  // NEVER modified after creation

  // Commitment metadata
  committedBy: string;     // Human who authorized
  committedAt: Date;

  // Invariant checks at commit time
  invariantChecks: StoredInvariantCheckResult[];
  overrideJustification: string | null;  // If warnings were overridden

  // Supersession chain
  supersedes: string | null;    // ID of commitment this supersedes
  supersededBy: string | null;  // ID of commitment that superseded this
  status: 'active' | 'superseded';
}
```

## Canonical Atom Snapshot

When atoms are committed, their state is frozen in `canonicalJson`:

```typescript
interface CanonicalAtomSnapshot {
  atomId: string;
  description: string;
  category: string;
  qualityScore: number | null;
  observableOutcomes: ObservableOutcome[];
  falsifiabilityCriteria: FalsifiabilityCriterion[];
  tags: string[];
}
```

This snapshot is **immutable by database trigger** - any attempt to UPDATE this field will fail.

## Invariant Check Results

Each commitment stores the results of all invariant checks:

```typescript
interface StoredInvariantCheckResult {
  invariantId: string;    // e.g., "INV-001"
  name: string;
  passed: boolean;
  severity: 'error' | 'warning';
  message: string;
  checkedAt: Date;
}
```

- **Blocking invariants** (severity: 'error') - Must pass for commitment
- **Non-blocking invariants** (severity: 'warning') - Can be overridden with justification

## Commitment Flow

```
1. User initiates commitment
         │
         ▼
2. Check all enabled invariants
         │
         ├─── Blocking failures? ──> Reject with errors
         │
         ▼
3. Warnings present?
         │
         ├─── Yes ──> Require override justification
         │
         ▼
4. Create canonical snapshot of atoms
         │
         ▼
5. Store CommitmentArtifact
         │
         ▼
6. Update atom statuses to 'committed'
```

## Supersession

Committed atoms cannot be changed, but can be superseded:

```
COM-001 (active)
    │
    └──supersede()──> COM-002 (active)
                          │
    COM-001 (superseded)  │
                          └──supersede()──> COM-003 (active)
                                               │
                              COM-002 (superseded)
```

## File Structure

```
commitments/
├── commitment.entity.ts           # TypeORM entity
├── commitments.controller.ts      # REST API endpoints
├── commitments.service.ts         # Business logic
├── commitments.module.ts          # NestJS module
├── dto/
│   ├── create-commitment.dto.ts
│   └── supersede-commitment.dto.ts
└── constraint-enforcement.spec.ts # Invariant enforcement tests
```

## Related Modules

- **atoms** - Atoms that are committed
- **molecules** - Optional grouping context
- **invariants** - Rules checked at commitment time
- **projects** - Per-project configuration

## See Also

- [CLAUDE.md - Commitment Boundary](/CLAUDE.md#the-coupling-mechanism-tests)
- [Invariants Module](/src/modules/invariants/README.md)
