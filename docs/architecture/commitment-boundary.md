# Commitment Boundary Architecture

This document describes the internal architecture of Pact's Commitment Boundary system, including the invariant checking engine and commitment flow.

## Overview

The Commitment Boundary is the defining feature of Pact - the phase transition where:

- Ambiguity collapses
- Interpretation freezes
- Intent becomes immutable

This document covers the technical implementation of this system.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Commitment Flow                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐                                                    │
│  │  CommitmentsController                                                │
│  │  POST /commitments                                                    │
│  └─────────┬────────┘                                                    │
│            │                                                             │
│            ▼                                                             │
│  ┌──────────────────┐    ┌──────────────────┐                           │
│  │  CommitmentsService   │    │  AtomsService     │                      │
│  │  - create()           │───▶│  - findByIds()    │                      │
│  │  - preview()          │    │  - markCommitted()|                      │
│  └─────────┬────────┘    └──────────────────┘                           │
│            │                                                             │
│            ▼                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                  InvariantCheckingService                          │   │
│  │                                                                    │   │
│  │  ┌─────────────────────────────────────────────────────────────┐ │   │
│  │  │               Invariant Checker Registry                     │ │   │
│  │  │                                                              │ │   │
│  │  │  ┌─────────┬─────────┬─────────┬─────────┬───────────────┐ │ │   │
│  │  │  │ INV-001 │ INV-002 │ INV-003 │   ...   │    INV-009    │ │ │   │
│  │  │  │ Explicit│ Testable│ No Ambig│         │ Ambig Resolve │ │ │   │
│  │  │  └─────────┴─────────┴─────────┴─────────┴───────────────┘ │ │   │
│  │  └─────────────────────────────────────────────────────────────┘ │   │
│  │                                                                    │   │
│  │  checkAll(atoms, context) → InvariantCheckResult[]                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│            │                                                             │
│            ▼                                                             │
│  ┌──────────────────┐    ┌──────────────────┐                           │
│  │  Decision Logic   │───▶│  CommitmentsGateway                         │
│  │  - Block or Allow │    │  - WebSocket Events │                        │
│  └─────────┬────────┘    └──────────────────┘                           │
│            │                                                             │
│            ▼                                                             │
│  ┌──────────────────┐                                                    │
│  │  Database         │                                                    │
│  │  - commitments    │                                                    │
│  │  - atoms (update) │                                                    │
│  └──────────────────┘                                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Module Structure

```
src/modules/
├── commitments/
│   ├── commitments.module.ts       # Module definition
│   ├── commitments.controller.ts   # HTTP endpoints
│   ├── commitments.service.ts      # Business logic
│   ├── commitments.repository.ts   # Database queries
│   ├── commitment.entity.ts        # TypeORM entity
│   └── dto/
│       ├── create-commitment.dto.ts
│       ├── commitment-response.dto.ts
│       ├── commitment-preview.dto.ts
│       ├── commitment-search.dto.ts
│       └── supersede-commitment.dto.ts
│
├── invariants/
│   ├── invariants.module.ts        # Module definition
│   ├── invariants.controller.ts    # HTTP endpoints
│   ├── invariants.service.ts       # CRUD operations
│   ├── invariant-checking.service.ts  # Check execution
│   ├── invariant-config.entity.ts  # TypeORM entity
│   ├── checkers/
│   │   ├── interfaces.ts           # InvariantChecker interface
│   │   ├── abstract-checker.ts     # Base class
│   │   ├── explicit-commitment.checker.ts    # INV-001
│   │   ├── behavioral-testability.checker.ts # INV-002
│   │   ├── no-ambiguity.checker.ts           # INV-003
│   │   ├── immutability.checker.ts           # INV-004
│   │   ├── traceability.checker.ts           # INV-005
│   │   ├── human-commit.checker.ts           # INV-006
│   │   ├── evidence-immutability.checker.ts  # INV-007
│   │   ├── rejection-limited.checker.ts      # INV-008
│   │   └── ambiguity-resolution.checker.ts   # INV-009
│   ├── data/
│   │   └── builtin-invariants.ts   # Seed data
│   └── dto/
│       ├── create-invariant.dto.ts
│       ├── update-invariant.dto.ts
│       └── invariant-response.dto.ts
│
├── projects/
│   ├── projects.module.ts
│   ├── projects.service.ts
│   └── project.entity.ts
│
└── agents/
    ├── commitment-agent.service.ts  # Agent-driven flow
    └── prompts/
        └── commitment-flow.prompts.ts
```

## Invariant Checker Interface

### Core Interface

```typescript
// src/modules/invariants/checkers/interfaces.ts

export interface InvariantChecker {
  invariantId: string;
  check(atoms: Atom[], context: CheckContext): Promise<InvariantCheckResult>;
}

export interface CheckContext {
  projectId?: string;
  committedBy: string;
  isPreview: boolean;
  existingCommitments?: CommitmentArtifact[];
}

export interface InvariantCheckResult {
  invariantId: string;
  invariantName: string;
  passed: boolean;
  severity: 'error' | 'warning';
  message: string;
  affectedAtomIds: string[];
  suggestions: string[];
}
```

### Abstract Base Class

```typescript
// src/modules/invariants/checkers/abstract-checker.ts

export abstract class AbstractInvariantChecker implements InvariantChecker {
  abstract invariantId: string;
  abstract check(atoms: Atom[], context: CheckContext): Promise<InvariantCheckResult>;

  protected createResult(
    passed: boolean,
    severity: 'error' | 'warning',
    message: string,
    affectedAtomIds: string[] = [],
    suggestions: string[] = [],
  ): InvariantCheckResult {
    return {
      invariantId: this.invariantId,
      invariantName: this.getInvariantName(),
      passed,
      severity,
      message,
      affectedAtomIds,
      suggestions,
    };
  }

  protected abstract getInvariantName(): string;
}
```

## Built-in Checker Implementations

### INV-001: Explicit Commitment Checker

```typescript
// src/modules/invariants/checkers/explicit-commitment.checker.ts

@Injectable()
export class ExplicitCommitmentChecker extends AbstractInvariantChecker {
  invariantId = 'INV-001';

  async check(atoms: Atom[], context: CheckContext): Promise<InvariantCheckResult> {
    // Check that committedBy is provided and valid
    if (!context.committedBy || context.committedBy.trim() === '') {
      return this.createResult(
        false,
        'error',
        'Commitment requires explicit human authorization (committedBy is missing)',
      );
    }
    return this.createResult(true, 'error', 'Explicit commitment provided');
  }

  protected getInvariantName(): string {
    return 'Explicit Commitment Required';
  }
}
```

### INV-002: Behavioral Testability Checker

```typescript
// src/modules/invariants/checkers/behavioral-testability.checker.ts

@Injectable()
export class BehavioralTestabilityChecker extends AbstractInvariantChecker {
  invariantId = 'INV-002';

  async check(atoms: Atom[], context: CheckContext): Promise<InvariantCheckResult> {
    const failingAtoms: string[] = [];

    for (const atom of atoms) {
      // Check quality score
      if (atom.qualityScore !== null && atom.qualityScore < 60) {
        failingAtoms.push(atom.id);
        continue;
      }

      // Check for observable outcomes
      if (!atom.observableOutcomes || atom.observableOutcomes.length === 0) {
        failingAtoms.push(atom.id);
      }
    }

    if (failingAtoms.length > 0) {
      return this.createResult(
        false,
        'error',
        `${failingAtoms.length} atom(s) are not behaviorally testable`,
        failingAtoms,
        ['Add observable outcomes to each atom', 'Ensure quality score >= 60'],
      );
    }

    return this.createResult(true, 'error', 'All atoms are behaviorally testable');
  }

  protected getInvariantName(): string {
    return 'Intent Atoms Must Be Behaviorally Testable';
  }
}
```

### INV-003: No Ambiguity Checker

```typescript
// src/modules/invariants/checkers/no-ambiguity.checker.ts

@Injectable()
export class NoAmbiguityChecker extends AbstractInvariantChecker {
  invariantId = 'INV-003';

  private readonly ambiguousPatterns = [
    /\bshould\s+be\s+(?:fast|quick|responsive)\b/i,
    /\bappropriate\b/i,
    /\breasonable\b/i,
    /\badequate\b/i,
    /\bas\s+needed\b/i,
    /\betc\.?\b/i,
    /\band\s+so\s+on\b/i,
    /\bTODO\b/i,
    /\bFIXME\b/i,
    /\bTBD\b/i,
  ];

  async check(atoms: Atom[], context: CheckContext): Promise<InvariantCheckResult> {
    const ambiguousAtoms: { id: string; patterns: string[] }[] = [];

    for (const atom of atoms) {
      const foundPatterns: string[] = [];
      for (const pattern of this.ambiguousPatterns) {
        if (pattern.test(atom.description)) {
          foundPatterns.push(pattern.source);
        }
      }
      if (foundPatterns.length > 0) {
        ambiguousAtoms.push({ id: atom.id, patterns: foundPatterns });
      }
    }

    if (ambiguousAtoms.length > 0) {
      return this.createResult(
        false,
        'warning',
        `${ambiguousAtoms.length} atom(s) contain potentially ambiguous language`,
        ambiguousAtoms.map(a => a.id),
        ['Replace vague terms with specific, measurable criteria'],
      );
    }

    return this.createResult(true, 'warning', 'No ambiguity detected');
  }

  protected getInvariantName(): string {
    return 'No Ambiguity in Commitment Artifacts';
  }
}
```

## Invariant Checking Service

```typescript
// src/modules/invariants/invariant-checking.service.ts

@Injectable()
export class InvariantCheckingService {
  private checkers: Map<string, InvariantChecker> = new Map();

  constructor(
    private readonly invariantsService: InvariantsService,
    // Inject all checker implementations
    private readonly explicitCommitmentChecker: ExplicitCommitmentChecker,
    private readonly behavioralTestabilityChecker: BehavioralTestabilityChecker,
    private readonly noAmbiguityChecker: NoAmbiguityChecker,
    private readonly immutabilityChecker: ImmutabilityChecker,
    private readonly traceabilityChecker: TraceabilityChecker,
    private readonly humanCommitChecker: HumanCommitChecker,
    private readonly evidenceImmutabilityChecker: EvidenceImmutabilityChecker,
    private readonly rejectionLimitedChecker: RejectionLimitedChecker,
    private readonly ambiguityResolutionChecker: AmbiguityResolutionChecker,
  ) {
    // Register all checkers
    this.registerChecker(this.explicitCommitmentChecker);
    this.registerChecker(this.behavioralTestabilityChecker);
    // ... etc
  }

  private registerChecker(checker: InvariantChecker): void {
    this.checkers.set(checker.invariantId, checker);
  }

  async checkAll(
    atoms: Atom[],
    context: CheckContext,
  ): Promise<{
    results: InvariantCheckResult[];
    hasBlockingViolations: boolean;
    hasWarnings: boolean;
  }> {
    // Get enabled invariants for project
    const enabledInvariants = await this.invariantsService.findEnabled(context.projectId);

    // Run all enabled checkers in parallel
    const results = await Promise.all(
      enabledInvariants.map(async (invariantConfig) => {
        const checker = this.checkers.get(invariantConfig.invariantId);
        if (!checker) {
          return this.createSkippedResult(invariantConfig);
        }

        const result = await checker.check(atoms, context);

        // Override severity based on config
        return {
          ...result,
          severity: invariantConfig.isBlocking ? 'error' : 'warning',
        };
      }),
    );

    const hasBlockingViolations = results.some(r => !r.passed && r.severity === 'error');
    const hasWarnings = results.some(r => !r.passed && r.severity === 'warning');

    return { results, hasBlockingViolations, hasWarnings };
  }

  async checkSingle(
    atoms: Atom[],
    invariantId: string,
    context: CheckContext,
  ): Promise<InvariantCheckResult> {
    const checker = this.checkers.get(invariantId);
    if (!checker) {
      throw new NotFoundException(`Checker for ${invariantId} not found`);
    }
    return checker.check(atoms, context);
  }
}
```

## Commitment Flow

### CommitmentsService.create()

```typescript
// src/modules/commitments/commitments.service.ts

async create(dto: CreateCommitmentDto): Promise<CommitmentResponseDto> {
  // 1. Validate atoms exist and are in draft status
  const atoms = await this.atomsService.findByIds(dto.atomIds);
  this.validateAtomsForCommitment(atoms);

  // 2. Run invariant checks
  const checkContext: CheckContext = {
    projectId: dto.projectId,
    committedBy: dto.committedBy,
    isPreview: false,
  };
  const { results, hasBlockingViolations } =
    await this.invariantCheckingService.checkAll(atoms, checkContext);

  // 3. Block if blocking violations (unless override)
  if (hasBlockingViolations && !dto.overrideJustification) {
    throw new BadRequestException({
      message: 'Cannot commit: blocking invariant violations',
      violations: results.filter(r => !r.passed && r.severity === 'error'),
    });
  }

  // 4. Generate commitment ID
  const commitmentId = await this.generateCommitmentId();

  // 5. Create canonical JSON snapshot
  const canonicalJson = this.createCanonicalSnapshot(atoms);

  // 6. Create commitment record
  const commitment = await this.commitmentRepository.create({
    commitmentId,
    projectId: dto.projectId,
    moleculeId: dto.moleculeId,
    canonicalJson,
    committedBy: dto.committedBy,
    committedAt: new Date(),
    invariantChecks: this.serializeCheckResults(results),
    overrideJustification: dto.overrideJustification,
    status: 'active',
  });

  // 7. Update atom statuses
  await this.atomsService.markCommitted(dto.atomIds, commitment.id);

  // 8. Create commitment-atom associations
  await this.createCommitmentAtomAssociations(commitment.id, dto.atomIds);

  // 9. Emit WebSocket event
  this.commitmentsGateway.emitCommitmentCreated(commitment);

  // 10. Log agent action
  await this.logCommitmentAction(commitment, atoms);

  return this.toResponseDto(commitment, atoms);
}
```

### Preview Flow

```typescript
async preview(dto: CreateCommitmentDto): Promise<CommitmentPreviewDto> {
  // Same validation as create
  const atoms = await this.atomsService.findByIds(dto.atomIds);
  this.validateAtomsForCommitment(atoms);

  // Run checks with isPreview = true
  const checkContext: CheckContext = {
    projectId: dto.projectId,
    committedBy: dto.committedBy,
    isPreview: true,
  };
  const { results, hasBlockingViolations, hasWarnings } =
    await this.invariantCheckingService.checkAll(atoms, checkContext);

  return {
    canCommit: !hasBlockingViolations,
    hasBlockingIssues: hasBlockingViolations,
    hasWarnings,
    atoms: atoms.map(a => this.toAtomSummary(a)),
    invariantChecks: results,
    atomCount: atoms.length,
    blockingIssues: results
      .filter(r => !r.passed && r.severity === 'error')
      .map(r => r.message),
    warnings: results
      .filter(r => !r.passed && r.severity === 'warning')
      .map(r => r.message),
  };
}
```

## Immutability Enforcement

### Database Level

```sql
-- Migration: 1737590400000-AddImmutabilityConstraints.ts

-- Prevent updates to committed atoms
CREATE OR REPLACE FUNCTION prevent_committed_atom_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'committed' AND NEW.status != 'superseded' THEN
    RAISE EXCEPTION 'Cannot modify committed atom (INV-004)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER atom_immutability_trigger
BEFORE UPDATE ON atoms
FOR EACH ROW
EXECUTE FUNCTION prevent_committed_atom_update();

-- Prevent deletion of committed atoms
CREATE OR REPLACE FUNCTION prevent_committed_atom_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('committed', 'superseded') THEN
    RAISE EXCEPTION 'Cannot delete committed or superseded atom (INV-004)';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER atom_deletion_trigger
BEFORE DELETE ON atoms
FOR EACH ROW
EXECUTE FUNCTION prevent_committed_atom_delete();
```

### API Level (Guard)

```typescript
// src/common/guards/committed-atom.guard.ts

@Injectable()
export class CommittedAtomGuard implements CanActivate {
  constructor(
    private readonly atomsService: AtomsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const atomId = request.params.id;

    if (!atomId) return true;

    // Check if operation is explicitly allowed
    const allowCommittedOperation = this.reflector.get<boolean>(
      'allowCommittedAtomOperation',
      context.getHandler(),
    );
    if (allowCommittedOperation) return true;

    const atom = await this.atomsService.findOne(atomId);
    if (atom && atom.status !== 'draft') {
      throw new ForbiddenException(
        `Cannot modify atom in ${atom.status} status. Use supersession instead (INV-004).`,
      );
    }

    return true;
  }
}
```

## WebSocket Events

```typescript
// src/gateways/commitments.gateway.ts

@WebSocketGateway({ namespace: '/commitments' })
export class CommitmentsGateway {
  @WebSocketServer()
  server: Server;

  emitCommitmentCreated(commitment: CommitmentArtifact): void {
    this.server.emit('commitment:created', {
      commitmentId: commitment.commitmentId,
      status: commitment.status,
      atomCount: commitment.canonicalJson.length,
    });
  }

  emitCommitmentSuperseded(original: string, replacement: string): void {
    this.server.emit('commitment:superseded', {
      originalId: original,
      replacementId: replacement,
    });
  }

  emitInvariantCheckProgress(invariantId: string, status: string): void {
    this.server.emit('invariant:checking', {
      invariantId,
      status,
    });
  }
}
```

## Agent-Driven Commitment

```typescript
// src/modules/agents/commitment-agent.service.ts

@Injectable()
export class CommitmentAgentService {
  async proposeAtomsFromIntent(molecularIntent: string): Promise<AtomProposal[]> {
    // Use atomization agent to break down intent
    const analysis = await this.atomizationService.analyzeIntent(molecularIntent);

    // Return proposed atoms with quality scores
    return analysis.proposedAtoms.map(atom => ({
      ...atom,
      qualityScore: atom.qualityValidation?.totalScore,
      readyForCommitment: (atom.qualityValidation?.totalScore ?? 0) >= 80,
    }));
  }

  async prepareCommitment(atomIds: string[]): Promise<CommitmentPreview> {
    // Run preview to identify issues
    return this.commitmentsService.preview({
      atomIds,
      committedBy: 'agent-preparation', // Will be replaced by human
    });
  }

  async executeCommitment(
    atomIds: string[],
    humanApproval: HumanApproval,
  ): Promise<CommitmentArtifact> {
    // Verify human approval (INV-006)
    if (!humanApproval.approved || !humanApproval.approvedBy) {
      throw new ForbiddenException('Human approval required for commitment (INV-006)');
    }

    return this.commitmentsService.create({
      atomIds,
      committedBy: humanApproval.approvedBy,
      overrideJustification: humanApproval.overrideJustification,
    });
  }
}
```

## Error Handling

### Error Codes

| Code | Description |
|------|-------------|
| `COMMITMENT_ATOM_NOT_FOUND` | One or more atom IDs do not exist |
| `COMMITMENT_ATOM_NOT_DRAFT` | Atom is not in draft status |
| `COMMITMENT_BLOCKING_VIOLATIONS` | Blocking invariant violations exist |
| `COMMITMENT_ALREADY_SUPERSEDED` | Commitment was already superseded |
| `INVARIANT_NOT_FOUND` | Invariant ID not found |
| `INVARIANT_BUILTIN_PROTECTED` | Cannot delete built-in invariant |

### Error Response Format

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Cannot commit: blocking invariant violations",
  "code": "COMMITMENT_BLOCKING_VIOLATIONS",
  "violations": [
    {
      "invariantId": "INV-002",
      "message": "Atom IA-003 is not behaviorally testable",
      "affectedAtomIds": ["uuid-here"],
      "suggestions": ["Add observable outcomes"]
    }
  ]
}
```

## Performance Considerations

### Parallel Checker Execution

All invariant checkers run in parallel using `Promise.all()` for optimal performance.

### Caching

- Invariant configurations are cached on startup
- Cache invalidation occurs on config updates
- Future: Redis cache for distributed deployments

### Database Optimization

- Indexes on `status`, `commitmentId`, `projectId`
- Batch updates for atom status changes
- Connection pooling via TypeORM

## Testing

### Unit Tests

- Each checker has dedicated test file
- Service methods tested with mocked dependencies
- Controller endpoints tested with supertest

### Integration Tests

- Full commitment flow with real database
- Invariant checking with multiple checkers
- WebSocket event emission verification

### E2E Tests

- Complete user journey from atom creation to commitment
- Supersession workflow
- Error handling scenarios

## References

- [Committing Atoms User Guide](../user-guide/committing-atoms.md)
- [Configuring Invariants User Guide](../user-guide/configuring-invariants.md)
- [Database Schema](../schema.md)
- [Global Invariants](../../ingest/invariants.md)
