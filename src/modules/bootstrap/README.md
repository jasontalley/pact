# Bootstrap Module

Tracks bootstrap scaffolding - temporary code that exists only to get Pact to self-hosting.

## Overview

The bootstrap module provides a database registry for tracking scaffolding code. This ensures all temporary code has explicit exit criteria and demolition plans.

**Key Principle**: Scaffolding cannot create new truths. It can only help arrive at truths that will eventually be represented as atoms + tests + invariants.

**Status**: Stub module - only entity defined.

## Entity: BootstrapScaffold

```typescript
interface BootstrapScaffold {
  id: string;              // UUID
  scaffoldId: string;      // e.g., "BS-001", "BS-002"

  // Classification
  scaffoldType: ScaffoldType;  // seed, migration, tooling, runtime

  // Documentation
  purpose: string;         // What this scaffold does
  exitCriterion: string;   // Testable condition for removal

  // Lifecycle
  targetRemoval: string;   // "Phase 0", "Phase 1", "Phase 2"
  owner: string | null;    // Who removes it
  removalTicket: string | null;  // Tracked like real work

  // Status
  status: 'active' | 'demolished';
  createdAt: Date;
  demolishedAt: Date | null;
  demolishedBy: string | null;
  notes: string | null;
}
```

## Scaffold Types

| Type | Purpose | Example |
|------|---------|---------|
| `seed` | Create initial invariants and atoms | Generate INV-001 through INV-009 |
| `migration` | Import legacy tests, infer atoms | Test analyzer, atom inference tool |
| `tooling` | Early CLI hacks, file generators | `bootstrap-cli create-atom` |
| `runtime` | Shortcuts in enforcement | `--warn-only` mode |

## Self-Hosting Milestones

```
Phase 0: "Pact Exists as a Tool" (Current)
├── Can read atoms from filesystem
├── Can run test audits
├── Can produce reports
└── Bootstrap status: All four types active

Phase 1: "Pact Can Validate Pact"
├── Pact's own repo described by atoms
├── Pact's CI gate enforced by Pact
└── Bootstrap status: Seed/migration demolished

Phase 2: "Pact Is Authoritative"
├── All atoms/tests/invariants managed by Pact
├── Bootstrap code removed or inert
└── Bootstrap status: All scaffolding demolished
```

## Tracking Scaffolds

### Creating a Scaffold Record
```typescript
// When adding new scaffold code, register it
await bootstrapService.create({
  scaffoldId: 'BS-003',
  scaffoldType: 'tooling',
  purpose: 'CLI for creating atom files',
  exitCriterion: 'Pact UI provides atom creation interface',
  targetRemoval: 'Phase 1',
  owner: 'team-pact'
});
```

### Checking Exit Criteria
```typescript
// During milestone review
const activeScaffolds = await bootstrapService.findActive();
for (const scaffold of activeScaffolds) {
  const canDemolish = await checkExitCriterion(scaffold);
  if (canDemolish) {
    await bootstrapService.demolish(scaffold.id, {
      demolishedBy: 'user-uuid',
      notes: 'Exit criterion met: UI now supports atom creation'
    });
  }
}
```

### Viewing Status
```typescript
// Get overview of scaffold status
const status = await bootstrapService.getStatus();
// {
//   active: { seed: 2, migration: 1, tooling: 3, runtime: 1 },
//   demolished: { seed: 0, migration: 0, tooling: 0, runtime: 0 },
//   byPhase: { 'Phase 1': 5, 'Phase 2': 2 }
// }
```

## File Structure

```
bootstrap/
├── bootstrap-scaffold.entity.ts  # TypeORM entity ✓
├── bootstrap.controller.ts       # REST API (TODO)
├── bootstrap.service.ts          # Business logic (TODO)
├── bootstrap.module.ts           # NestJS module ✓
└── dto/
    └── create-scaffold.dto.ts (TODO)
```

## Database Schema

```sql
CREATE TABLE bootstrap_scaffolds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scaffold_id VARCHAR(20) UNIQUE NOT NULL,
  scaffold_type VARCHAR(20) NOT NULL,
  purpose TEXT NOT NULL,
  exit_criterion TEXT NOT NULL,
  target_removal VARCHAR(20) NOT NULL,
  owner VARCHAR(255),
  removal_ticket VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  demolished_at TIMESTAMP,
  demolished_by VARCHAR(255),
  notes TEXT
);

CREATE INDEX idx_scaffolds_status ON bootstrap_scaffolds(status);
CREATE INDEX idx_scaffolds_type ON bootstrap_scaffolds(scaffold_type);
```

## Anti-Entrenchment

The database registry serves as a forcing function:

1. **Registration Required** - Can't add scaffold without exit criterion
2. **Visibility** - All scaffolds are tracked and auditable
3. **Accountability** - Each scaffold has an owner
4. **Progress Tracking** - Demolition is explicit and dated

## Related Modules

This module tracks code in `/bootstrap/` filesystem directory:

```
/bootstrap/
├── README.md           # Scaffold ledger (human-readable)
├── seed/               # Type: seed
├── migration/          # Type: migration
├── tooling/            # Type: tooling
└── runtime/            # Type: runtime
```

## See Also

- [CLAUDE.md - Bootstrap Scaffolding](/CLAUDE.md#bootstrap-scaffolding)
- [/bootstrap/README.md](/bootstrap/README.md) - Scaffold ledger
