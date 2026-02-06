# Clarifications Module

Stores clarification artifacts - Q&A pairs that resolve ambiguity in committed atoms.

## Overview

When ambiguity is discovered in a committed atom (post-commitment), INV-009 requires that it be resolved explicitly through either:

1. A superseding commitment (creating a new atom)
2. A clarification artifact (Q&A that clarifies without changing the atom)

This module handles the second option.

**Status**: Stub module - only entity defined, no service/controller yet.

## Entity: Clarification

```typescript
interface Clarification {
  id: string;              // UUID
  atomId: string;          // FK to Atom being clarified

  // Q&A
  question: string;        // What was ambiguous?
  answer: string;          // How is it clarified?

  // Metadata
  createdAt: Date;
  createdBy: string | null;
  metadata: Record<string, any>;
}
```

## Invariant Enforcement

Clarification artifacts support:

| Invariant | Description |
|-----------|-------------|
| INV-009 | Post-Commitment Ambiguity Must Be Resolved Explicitly |

Rather than silently resolving ambiguity, clarifications create an explicit record.

## Use Cases

### Developer Question
```typescript
// During implementation, developer asks clarifying question
await clarificationsService.create({
  atomId: 'atom-uuid',
  question: 'Does "fast" mean under 100ms or under 1 second?',
  answer: 'Under 100ms for p95 latency',
  createdBy: 'user-uuid'
});
```

### AI-Driven Clarification
```typescript
// Interview agent captures clarifications
await clarificationsService.create({
  atomId: 'atom-uuid',
  question: 'Should validation errors be logged or just returned?',
  answer: 'Both - log at WARN level and return to caller',
  metadata: {
    source: 'interview-agent',
    sessionId: 'session-uuid'
  }
});
```

### Ambiguity Resolution
```typescript
// When ambiguity is discovered post-commitment
await clarificationsService.create({
  atomId: 'committed-atom-uuid',
  question: 'The atom says "user-friendly error". What constitutes user-friendly?',
  answer: 'Non-technical language, actionable suggestion, no stack traces',
  metadata: {
    discoveredIn: 'code-review',
    prNumber: 42
  }
});
```

## Planned Features

When fully implemented:

### Service Methods
```typescript
class ClarificationsService {
  create(dto: CreateClarificationDto): Promise<Clarification>;
  findByAtom(atomId: string): Promise<Clarification[]>;
  findOne(id: string): Promise<Clarification>;

  // Search across clarifications
  search(query: string): Promise<Clarification[]>;

  // Get clarifications for related atoms
  findRelated(atomId: string): Promise<Clarification[]>;
}
```

### API Endpoints
```typescript
GET    /clarifications?atomId=xxx     // List clarifications for atom
GET    /clarifications/:id            // Get single clarification
POST   /clarifications                // Create clarification
GET    /clarifications/search?q=xxx   // Search clarifications
```

## File Structure

```
clarifications/
├── clarification.entity.ts      # TypeORM entity ✓
├── clarifications.controller.ts # REST API (TODO)
├── clarifications.service.ts    # Business logic (TODO)
├── clarifications.module.ts     # NestJS module ✓
└── dto/
    └── create-clarification.dto.ts (TODO)
```

## Database Schema

```sql
CREATE TABLE clarifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atom_id UUID NOT NULL REFERENCES atoms(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_clarifications_atom ON clarifications(atom_id);
```

## Difference from Supersession

| Approach | When to Use | Result |
|----------|-------------|--------|
| **Supersession** | Atom needs to change | New atom replaces old |
| **Clarification** | Atom is correct, just needs context | Q&A record added |

## Related Modules

- **atoms** - Clarifications are linked to atoms
- **commitments** - Alternative to superseding commitment
- **invariants** - INV-009 enforcement

## See Also

- [INV-009 - Post-Commitment Ambiguity Resolution](/src/modules/invariants/README.md)
