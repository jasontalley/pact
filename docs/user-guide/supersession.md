# Supersession

This guide explains how supersession works in Pact - the mechanism for "changing" committed atoms while preserving history.

## The Immutability Problem

Pact's core principle is that committed intent is immutable (INV-004). Once an atom is committed, it cannot be edited or deleted. This creates an important question:

> How do you fix mistakes or evolve requirements?

The answer is **supersession**.

## What is Supersession?

**Supersession** is the process of creating a new atom (or commitment) that replaces an existing one. The original is marked as "superseded" but remains in the system as a historical record.

```
Original Atom (IA-001)          New Atom (IA-010)
  status: superseded     →        status: committed
  supersededBy: IA-010            supersedes: IA-001
```

## Why Supersession Instead of Editing?

1. **Audit Trail**: Complete history of intent evolution
2. **Accountability**: Track who made changes and when
3. **Traceability**: Existing references remain valid
4. **Reversibility**: Can refer back to original decisions

## Superseding an Atom

### Via API

```bash
curl -X POST http://localhost:3000/atoms/{original-uuid}/supersede \
  -H "Content-Type: application/json" \
  -d '{
    "description": "User authentication must complete within 1 second under normal load",
    "category": "performance",
    "reason": "Tightened performance requirement based on user feedback"
  }'
```

**Response**:

```json
{
  "id": "new-uuid-here",
  "atomId": "IA-010",
  "description": "User authentication must complete within 1 second under normal load",
  "category": "performance",
  "status": "draft",
  "supersedes": "original-uuid-here",
  "metadata": {
    "supersessionReason": "Tightened performance requirement based on user feedback"
  }
}
```

### What Gets Inherited

When you supersede an atom, the new atom inherits (unless overridden):

- **Tags**: All tags from the original
- **Observable Outcomes**: Copied from original
- **Falsifiability Criteria**: Copied from original
- **Canvas Position**: Placed near the original

### What You Can Change

- **Description**: The core behavioral specification
- **Category**: If the nature of the atom changed
- **Observable Outcomes**: Updated measurement criteria
- **Falsifiability Criteria**: Updated pass/fail conditions

## The Supersession Chain

Atoms can be superseded multiple times, creating a chain:

```
IA-001 (superseded)
   ↓
IA-010 (superseded)
   ↓
IA-015 (committed, current)
```

### Viewing the Chain

```bash
curl http://localhost:3000/atoms/{any-uuid}/supersession-chain
```

**Response**:

```json
[
  {
    "id": "first-uuid",
    "atomId": "IA-001",
    "description": "Original description",
    "status": "superseded",
    "createdAt": "2026-01-15T10:00:00Z"
  },
  {
    "id": "second-uuid",
    "atomId": "IA-010",
    "description": "First revision",
    "status": "superseded",
    "createdAt": "2026-01-20T10:00:00Z"
  },
  {
    "id": "current-uuid",
    "atomId": "IA-015",
    "description": "Current version",
    "status": "committed",
    "createdAt": "2026-01-25T10:00:00Z"
  }
]
```

## Superseding Commitments

Commitments can also be superseded when you need to change a group of atoms.

### Via API

```bash
curl -X POST http://localhost:3000/commitments/{commitment-uuid}/supersede \
  -H "Content-Type: application/json" \
  -d '{
    "atomIds": [
      "new-atom-uuid-1",
      "new-atom-uuid-2",
      "unchanged-atom-uuid-3"
    ],
    "committedBy": "jane.doe@company.com",
    "reason": "Updated authentication requirements based on security audit"
  }'
```

**Response**:

```json
{
  "id": "new-commitment-uuid",
  "commitmentId": "COM-005",
  "status": "active",
  "supersedes": "original-commitment-uuid",
  "committedBy": "jane.doe@company.com",
  "committedAt": "2026-01-27T10:00:00Z",
  "atoms": [
    { "atomId": "IA-015", "description": "Updated atom" },
    { "atomId": "IA-016", "description": "New atom" },
    { "atomId": "IA-003", "description": "Unchanged atom" }
  ]
}
```

### Commitment History

View the supersession history of a commitment:

```bash
curl http://localhost:3000/commitments/{uuid}/history
```

## Supersession Workflow

### Step 1: Identify What Needs to Change

Determine whether you need to:
- Supersede individual atoms
- Supersede an entire commitment
- Or both

### Step 2: Create New Atom(s)

Use the supersede endpoint to create new atoms based on the originals:

```bash
curl -X POST http://localhost:3000/atoms/{uuid}/supersede \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated behavioral specification",
    "reason": "Why this change is needed"
  }'
```

### Step 3: Refine New Atoms

The new atom starts in draft status. Refine it until quality score >= 80.

### Step 4: Commit New Atoms

Create a new commitment with the superseding atoms:

```bash
curl -X POST http://localhost:3000/commitments \
  -H "Content-Type: application/json" \
  -d '{
    "atomIds": ["new-atom-uuid"],
    "committedBy": "jane.doe@company.com"
  }'
```

### Step 5: (Optional) Supersede Original Commitment

If the original was part of a commitment, supersede that commitment too.

## When to Supersede

### Good Reasons to Supersede

- **Requirements changed**: Business needs evolved
- **Clarification needed**: Original was ambiguous
- **Performance target changed**: SLAs updated
- **Security requirement updated**: New compliance needs
- **Bug in specification**: Original had an error

### Not Good Reasons to Supersede

- **Typo fix**: Consider if it materially changes meaning
- **Minor rewording**: Unless it clarifies ambiguity
- **Implementation detail**: Atoms shouldn't have these anyway

## Best Practices

### 1. Document the Reason

Always include a clear reason for supersession:

```json
{
  "reason": "Security audit identified that 2-second timeout is too long for authentication"
}
```

### 2. Supersede at the Right Level

- **Single atom changed**: Supersede just that atom
- **Multiple related atoms**: Consider superseding the commitment
- **Fundamental change**: Create entirely new atoms and commitment

### 3. Update Validators

When you supersede an atom, ensure validators are updated to test the new specification.

### 4. Communicate Changes

Supersession creates an audit trail, but stakeholders should be notified of significant changes.

### 5. Review the Chain

Periodically review supersession chains. Long chains may indicate:
- Requirements instability
- Need for better upfront specification
- Unclear domain understanding

## Common Scenarios

### Scenario 1: Tighten Performance Requirement

**Original**: "Response within 5 seconds"
**New**: "Response within 2 seconds"

```bash
curl -X POST http://localhost:3000/atoms/{uuid}/supersede \
  -d '{"description": "API response within 2 seconds", "reason": "User research showed 5s too slow"}'
```

### Scenario 2: Clarify Ambiguity

**Original**: "System must be secure"
**New**: "All API endpoints require authentication via JWT"

```bash
curl -X POST http://localhost:3000/atoms/{uuid}/supersede \
  -d '{"description": "All API endpoints require authentication via JWT", "reason": "Original was too vague"}'
```

### Scenario 3: Split an Atom

**Original**: "User can login and view dashboard"
**New**: Two separate atoms

```bash
# Create first atom manually (not supersession)
curl -X POST http://localhost:3000/atoms \
  -d '{"description": "User can authenticate with email and password"}'

# Create second atom manually
curl -X POST http://localhost:3000/atoms \
  -d '{"description": "Authenticated user can view dashboard"}'

# Mark original as superseded by one of them
curl -X POST http://localhost:3000/atoms/{original-uuid}/mark-superseded \
  -d '{"supersededBy": "first-new-uuid"}'
```

## UI Supersession Flow

### From Atom Detail Page

1. Click "Supersede" button
2. Edit the atom specification
3. Provide supersession reason
4. Submit (creates draft atom)
5. Refine and commit as normal

### From Commitment Detail Page

1. Click "Supersede Commitment"
2. Select which atoms to include/update
3. Provide reason
4. Review invariant checks
5. Commit the new commitment

### Viewing History

- **Atom History**: Shows supersession chain in expandable timeline
- **Commitment History**: Shows linked commitments with differences

## Error Handling

### "Cannot supersede draft atom"

Only committed or superseded atoms can be superseded. Draft atoms can be edited directly.

### "Circular supersession detected"

You cannot create a supersession that would form a loop in the chain.

### "Atom already superseded"

An atom that was already superseded can still be superseded again, but usually you want to supersede the latest in the chain.

## Next Steps

- [Committing Atoms](./committing-atoms.md) - Commit superseding atoms
- [Configuring Invariants](./configuring-invariants.md) - Invariants apply to superseding atoms too
- [Creating Validators](./creating-validators.md) - Update validators for superseded atoms
