# Bootstrap Scaffolding Ledger

**Purpose**: Track temporary code/tooling that will be demolished once Pact is self-hosting.

**Guiding Principle**: Scaffolding cannot create new truths. It can only help us arrive at truths that will eventually be represented as atoms + tests + invariants.

**Critical Rule**: `/bootstrap` is one-way dependent on `/src`. `/src` NEVER depends on `/bootstrap`.

---

## What is Bootstrap Scaffolding?

Bootstrap scaffolding = any code, config, or workflow that exists only to get Pact to the point where Pact can enforce its own invariants.

**Key Distinction**:

```bash
Proto-Pact (DATA - persists):
/ideas, /atoms, /molecules, /global
↳ Artifacts that will be imported into Pact once it's self-hosting

Bootstrap Scaffolding (CODE - demolished):
/bootstrap
↳ Temporary code that manipulates proto-Pact artifacts
↳ Once Pact is self-hosting, this code is deleted
```

---

## Four Scaffold Types

| Type | Purpose | Location | Exit Condition |
|------|---------|----------|----------------|
| **Seed** | Create initial global invariants and minimal atoms | `/bootstrap/seed/` | Pact can parse and enforce `/global` and `/atoms` without any seed step |
| **Migration** | Import legacy tests, infer atom refs, generate "needs atom" queues | `/bootstrap/migration/` | All imported artifacts normalized into canonical Pact structures |
| **Tooling** | Early CLI hacks, file generators, stub registries, temporary configs | `/bootstrap/tooling/` | Pact runtime provides canonical tooling interfaces and stable CLI |
| **Runtime** | Shortcuts in enforcement (e.g., "warn only" gates, permissive modes) | `/bootstrap/runtime/` | CI/local gates enforce invariants by default |

---

## Self-Hosting Milestones

### Phase 0: "Pact Exists as a Tool" (Current Target)

- Can read atoms from `/atoms`
- Can run test audits
- Can produce reports
- **Bootstrap status**: All four types active

### Phase 1: "Pact Can Validate Pact"

- Pact's own repo described by atoms
- Pact's build pipeline is described by atoms
- Pact's CI gate is enforced by Pact
- **Bootstrap status**: Seed/migration demolished; tooling/runtime remain

### Phase 2: "Pact Is Authoritative"

- Any change to atoms/tests/invariants blocked unless Pact approves
- All atoms/tests/invariants managed by Pact database
- Bootstrap code is either removed or inert
- **Bootstrap status**: All scaffolding demolished

---

## Active Scaffolds

| ID | Type | Purpose | Exit Criterion | Owner | Removal Ticket | Target Phase |
|----|------|---------|----------------|-------|----------------|--------------|
| BS-001 | tooling | Test quality analyzer for Red phase gate | Pact runtime provides built-in test quality analysis | @jasontalley | TBD | Phase 1 |
| BS-002 | tooling | Scaffold registry CLI for managing bootstrap code | No new scaffolds being created (Phase 2) | @jasontalley | TBD | Phase 2 |
| BS-003 | seed | Seed database with atom definitions from test annotations | Pact can manage atoms via UI/API without seed step | @jasontalley | TBD | Phase 1 |
| BS-004 | seed | Project atoms from database to filesystem | Pact provides built-in projection via API/CLI | @jasontalley | TBD | Phase 1 |
| BS-005 | tooling | Test-atom coupling analyzer for coupling score gate | Pact runtime provides built-in coupling analysis | @jasontalley | TBD | Phase 1 |

---

## Demolished Scaffolds

| ID | Type | Purpose | Demolition Date | Demolished By | Notes |
|----|------|---------|-----------------|---------------|-------|
| *No demolished scaffolds yet* | - | - | - | - | - |

---

## Version Stamp Template

Every bootstrap file must include this header:

```typescript
/**
 * BOOTSTRAP SCAFFOLDING - DO NOT DEPEND ON THIS
 * Scaffold ID: BS-XXX
 * Type: [Seed|Migration|Tooling|Runtime]
 * Purpose: [Brief description]
 * Exit Criterion: [Testable condition for removal]
 * Target Removal: [Phase 0|Phase 1|Phase 2]
 * Owner: [GitHub username or TBD]
 */
```

---

## Anti-Entrenchment Mechanisms

### Hard Mechanisms (Enforced by CI)

1. **One-way dependencies**: Bootstrap depends on pact-core; pact-core never depends on bootstrap
2. **Import check**: CI fails if any non-bootstrap module imports bootstrap
3. **Build-time flags**: `--bootstrap-mode` only in bootstrap binary, not main runtime

### Soft Mechanisms (Require Discipline)

1. **This ledger**: Forces explicit exit criteria for every scaffold
2. **Version stamps**: Every file labeled as scaffolding with removal plan
3. **Regular audits**: Check if exit criteria are met, demolish when ready

---

## Git Analogy for Developers

Think of bootstrap like the C compiler used to bootstrap a Rust compiler:

- You use C to build the first Rust compiler
- Once Rust can compile itself, you delete the C bootstrapping code
- Rust is now self-hosting

Similarly:

- You use `/bootstrap` to build Pact
- Once Pact can manage its own atoms, you delete `/bootstrap`
- Pact is now self-hosting

---

## When to Add Scaffolding

**Add to `/bootstrap` when**:

- You need temporary code to manipulate proto-Pact artifacts
- There's a clear exit criterion (when Pact can do this itself)
- The code doesn't define long-term semantics

**Add to `/src` when**:

- The code is part of Pact's permanent runtime
- The feature will exist after self-hosting
- The code defines semantic behavior that persists

**If unclear**: Ask "Will this exist after Phase 2?" If no → `/bootstrap`. If yes → `/src`.

---

**Last Updated**: 2026-01-16
