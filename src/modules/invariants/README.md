# Invariants Module

Manages global invariants - system-wide rules that apply to all atoms and commitments.

## Overview

Invariants are meta-rules that the system enforces at the Commitment Boundary. They ensure that committed intent meets quality and safety standards.

## Built-in Invariants

Pact includes 9 built-in invariants that are seeded on startup:

| ID | Name | Description | Type |
|----|------|-------------|------|
| INV-001 | Explicit Commitment Required | No intent may become enforceable without explicit human action | builtin |
| INV-002 | Intent Atoms Must Be Behaviorally Testable | Every committed atom must be observable and falsifiable | builtin |
| INV-003 | No Ambiguity in Commitment Artifacts | Artifacts must not contain unresolved ambiguity | llm |
| INV-004 | Commitment Is Immutable | Committed intent may only be superseded, never edited | builtin |
| INV-005 | Traceability Is Mandatory | All artifacts must reference their source | builtin |
| INV-006 | Agents May Not Commit Intent | Only humans may authorize commitment | builtin |
| INV-007 | Evidence Is First-Class and Immutable | Evidence artifacts cannot be altered or discarded | builtin |
| INV-008 | Rejection Is Limited to Invariants | System may reject only due to invariant violations | builtin |
| INV-009 | Post-Commitment Ambiguity Resolution | Must result in superseding commitment or clarification artifact | builtin |

## Entity: InvariantConfig

```typescript
interface InvariantConfig {
  id: string;              // UUID
  invariantId: string;     // e.g., "INV-001" or custom "MY-001"

  // Metadata
  name: string;
  description: string;

  // Configuration
  isEnabled: boolean;      // Can be disabled per-project
  isBlocking: boolean;     // true = error, false = warning

  // Check implementation
  checkType: 'builtin' | 'llm' | 'custom';
  checkConfig: {
    checkerName?: string;  // For builtin checkers
    prompt?: string;       // For LLM-based checks
    minQualityScore?: number;
    // ... other config
  };

  // Error handling
  errorMessage: string;
  suggestionPrompt: string; // AI guidance when violated

  // Scope
  projectId: string | null; // null = global default
  isBuiltin: boolean;       // true = seeded, cannot delete
}
```

## Check Types

### Builtin Checkers

Implemented in `src/modules/invariants/checkers/builtin/`:

```typescript
// Example: ExplicitCommitmentChecker
class ExplicitCommitmentChecker implements InvariantChecker {
  check(context: CheckContext): InvariantCheckResult {
    if (!context.committedBy || context.isAgentInitiated) {
      return { passed: false, message: 'Human commitment required' };
    }
    return { passed: true };
  }
}
```

### LLM-Based Checkers

Use AI to evaluate complex criteria:

```typescript
// INV-003: No Ambiguity
checkConfig: {
  prompt: `Analyze for ambiguity. Check for:
    1. Vague terms ("fast", "user-friendly")
    2. Implementation directives ("use React")
    3. Unresolved questions ("TBD")
    Respond with JSON: { "hasAmbiguity": boolean, "issues": string[] }`
}
```

### Custom Checkers

Projects can register custom checkers:

```typescript
// Example: Custom code coverage checker
{
  invariantId: 'PROJ-001',
  name: 'Minimum Code Coverage',
  checkType: 'custom',
  checkConfig: {
    checkerName: 'CodeCoverageChecker',
    minCoverage: 80
  }
}
```

## Per-Project Configuration

Invariants can be customized per project:

```typescript
// Copy global default to project
await invariantsService.copyForProject('INV-002', projectId);

// Then customize
await invariantsService.update(configId, {
  isBlocking: false,  // Make it a warning for this project
  checkConfig: { minQualityScore: 70 }  // Lower threshold
});
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/invariants` | List all invariants (optionally by project) |
| GET | `/invariants/enabled` | List enabled invariants |
| GET | `/invariants/:id` | Get single invariant config |
| POST | `/invariants` | Create custom invariant |
| PATCH | `/invariants/:id` | Update invariant config |
| DELETE | `/invariants/:id` | Delete custom invariant (builtin cannot be deleted) |
| POST | `/invariants/:id/enable` | Enable an invariant |
| POST | `/invariants/:id/disable` | Disable an invariant |
| POST | `/invariants/:invariantId/copy/:projectId` | Copy to project |

## Service Methods

```typescript
class InvariantsService {
  // Lifecycle
  onModuleInit(): Promise<void>;  // Seeds built-in invariants
  seedBuiltinInvariants(): Promise<void>;

  // CRUD
  create(dto: CreateInvariantDto): Promise<InvariantConfig>;
  findAll(projectId?: string): Promise<InvariantConfig[]>;
  findEnabled(projectId?: string): Promise<InvariantConfig[]>;
  findOne(id: string): Promise<InvariantConfig>;
  findByInvariantId(invariantId: string, projectId?: string): Promise<InvariantConfig | null>;
  update(id: string, dto: UpdateInvariantDto): Promise<InvariantConfig>;
  remove(id: string): Promise<void>;

  // Convenience
  enable(id: string): Promise<InvariantConfig>;
  disable(id: string): Promise<InvariantConfig>;
  copyForProject(invariantId: string, projectId: string): Promise<InvariantConfig>;
}
```

## File Structure

```
invariants/
├── invariant-config.entity.ts    # TypeORM entity
├── builtin-invariants.ts         # Built-in invariant definitions
├── invariants.controller.ts      # REST API
├── invariants.service.ts         # Business logic
├── invariant-checking.service.ts # Executes invariant checks
├── invariants.module.ts          # NestJS module
├── checkers/
│   └── builtin/                  # Builtin checker implementations
│       ├── explicit-commitment.checker.ts
│       ├── behavioral-testability.checker.ts
│       ├── immutability.checker.ts
│       └── ...
└── dto/
    ├── create-invariant.dto.ts
    └── update-invariant.dto.ts
```

## Related Modules

- **commitments** - Checks invariants at commitment time
- **atoms** - Subject of most invariant checks
- **projects** - Per-project invariant configuration

## See Also

- [CLAUDE.md - Global Invariants](/CLAUDE.md#global-invariants)
- [ingest/invariants.md](/ingest/invariants.md) - Full invariant specification
