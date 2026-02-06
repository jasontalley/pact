# Configuring Invariants

This guide explains how to view, configure, and customize invariants in Pact.

## What are Invariants?

**Invariants** are rules that must be satisfied at the Commitment Boundary. They enforce quality, consistency, and correctness before intent becomes immutable.

Pact includes 9 built-in invariants based on the Intent-Centric Software Manifesto, plus the ability to create custom invariants for project-specific needs.

## Built-in Invariants

### INV-001: Explicit Commitment Required

**Purpose**: Ensures commitment is an explicit human action, not automatic.

**What it checks**:
- Commitment request includes valid human identifier
- Request is not from an automated system

**Default**: Enabled, Blocking

---

### INV-002: Intent Atoms Must Be Behaviorally Testable

**Purpose**: Ensures atoms describe observable, falsifiable behavior.

**What it checks**:
- Atom has observable outcomes defined
- Atom has falsifiability criteria
- Quality score meets minimum threshold

**Default**: Enabled, Blocking

---

### INV-003: No Ambiguity in Commitment Artifacts

**Purpose**: Prevents vague or unclear intent from being committed.

**What it checks**:
- Atom description doesn't contain ambiguous language patterns
- No unresolved questions or TODOs
- Implementation details are not included

**Default**: Enabled, Warning (can be overridden with justification)

---

### INV-004: Commitment Is Immutable

**Purpose**: Ensures committed atoms cannot be modified.

**What it checks**:
- Atoms being committed are in draft status
- No attempt to re-commit already committed atoms

**Default**: Enabled, Blocking

---

### INV-005: Traceability Is Mandatory

**Purpose**: Ensures all artifacts reference their source.

**What it checks**:
- Atom has parent_intent or source reference
- Refinement history is populated

**Default**: Enabled, Warning

---

### INV-006: Agents May Not Commit Intent

**Purpose**: Only humans can authorize commitment.

**What it checks**:
- `committedBy` field contains human identifier
- Not a known agent/bot identifier

**Default**: Enabled, Blocking

---

### INV-007: Evidence Is First-Class and Immutable

**Purpose**: Ensures evidence artifacts cannot be altered.

**What it checks**:
- Placeholder for future evidence validation
- Currently passes by default

**Default**: Enabled, Warning

---

### INV-008: Rejection Is Limited to Invariants

**Purpose**: System may only reject intent due to invariant violations.

**What it checks**:
- Rejection reasons map to specific invariants
- No arbitrary rejections

**Default**: Enabled, Warning

---

### INV-009: Post-Commitment Ambiguity Must Be Resolved Explicitly

**Purpose**: Ambiguity discovered after commitment must be resolved explicitly.

**What it checks**:
- If clarification is needed, clarification artifact exists
- No implicit assumption resolution

**Default**: Enabled, Warning

## Viewing Invariants

### List All Invariants

```bash
curl http://localhost:3000/invariants
```

**Response**:

```json
[
  {
    "id": "uuid-here",
    "invariantId": "INV-001",
    "name": "Explicit Commitment Required",
    "description": "No intent may become enforceable without an explicit human commitment action.",
    "isEnabled": true,
    "isBlocking": true,
    "checkType": "builtin",
    "isBuiltin": true,
    "createdAt": "2026-01-21T10:00:00Z"
  },
  ...
]
```

### List Enabled Invariants Only

```bash
curl http://localhost:3000/invariants/enabled
```

### Filter by Project

```bash
curl "http://localhost:3000/invariants?projectId=project-uuid"
```

### Get Single Invariant

```bash
curl http://localhost:3000/invariants/{uuid}
```

## Configuring Invariants

### Enable an Invariant

```bash
curl -X PATCH http://localhost:3000/invariants/{uuid}/enable
```

### Disable an Invariant

```bash
curl -X PATCH http://localhost:3000/invariants/{uuid}/disable
```

**Note**: Disabling a blocking invariant means it won't be checked during commitment.

### Update Invariant Settings

For built-in invariants, you can modify:
- `isEnabled`: Whether the invariant is active
- `isBlocking`: Whether violations block commitment (vs. warning)
- `errorMessage`: Custom error message
- `suggestionPrompt`: Custom LLM prompt for fix suggestions

```bash
curl -X PATCH http://localhost:3000/invariants/{uuid} \
  -H "Content-Type: application/json" \
  -d '{
    "isBlocking": false,
    "errorMessage": "Custom message for this invariant violation"
  }'
```

**Note**: You cannot change the `checkType` of built-in invariants.

## Project-Specific Configuration

Invariants can be configured per-project to have different behavior.

### Copy Global Invariant for Project

Create a project-specific copy of a global invariant:

```bash
curl -X POST http://localhost:3000/invariants/copy/INV-003/project/{project-uuid}
```

This creates a new configuration that:
- Applies only to the specified project
- Can be enabled/disabled independently
- Can have different blocking/warning behavior

### Example: Make INV-003 Non-Blocking for MVP

```bash
# 1. Copy the invariant for your project
curl -X POST http://localhost:3000/invariants/copy/INV-003/project/{project-uuid}

# 2. Update the project-specific copy
curl -X PATCH http://localhost:3000/invariants/{new-uuid} \
  -H "Content-Type: application/json" \
  -d '{
    "isBlocking": false
  }'
```

## Creating Custom Invariants

You can create custom invariants for project-specific rules.

### Create Custom Invariant

```bash
curl -X POST http://localhost:3000/invariants \
  -H "Content-Type: application/json" \
  -d '{
    "invariantId": "INV-010",
    "name": "Domain Naming Convention",
    "description": "All atoms must reference domain objects with proper naming",
    "isEnabled": true,
    "isBlocking": false,
    "checkType": "custom",
    "checkConfig": {
      "rules": [
        { "pattern": "^[A-Z]", "field": "description" }
      ]
    },
    "errorMessage": "Atom description must start with uppercase letter",
    "suggestionPrompt": "Suggest how to fix the naming convention violation"
  }'
```

### Check Types

| Type | Description |
|------|-------------|
| `builtin` | Uses built-in checker logic (INV-001 through INV-009) |
| `custom` | Uses JSON-based rule definitions |
| `llm` | Uses LLM prompts for validation (future) |

### Custom Check Config Schema

For `custom` type invariants:

```json
{
  "rules": [
    {
      "pattern": "regex-pattern",
      "field": "description|category|tags",
      "negate": false
    }
  ],
  "minQualityScore": 80,
  "requiredTags": ["tag1", "tag2"],
  "forbiddenPatterns": ["TODO", "FIXME"]
}
```

### Delete Custom Invariant

```bash
curl -X DELETE http://localhost:3000/invariants/{uuid}
```

**Note**: Built-in invariants cannot be deleted.

## Invariants UI

### Accessing Invariant Settings

Navigate to **Settings > Invariants** in the Pact UI.

### Invariant List View

The list shows:
- Invariant ID and name
- Enabled/disabled status (toggle)
- Blocking/warning indicator
- Built-in badge for system invariants

### Invariant Configuration Card

Click on an invariant to see:
- Full description
- Current configuration
- Check type
- Error message
- Enable/disable toggle
- Blocking/warning toggle

### Filtering

Filter invariants by:
- **Type**: Built-in, Custom
- **Status**: Enabled, Disabled
- **Severity**: Blocking, Warning

## Best Practices

### 1. Don't Disable Core Invariants

INV-001, INV-004, and INV-006 are fundamental to Pact's integrity. Disabling them defeats the purpose of the Commitment Boundary.

### 2. Use Warnings for Soft Rules

If a rule should be followed but has legitimate exceptions, make it a warning rather than blocking.

### 3. Document Override Patterns

If certain invariants are frequently overridden, consider:
- Adjusting the invariant to be more lenient
- Creating project-specific configurations
- Documenting when overrides are acceptable

### 4. Review Invariant Reports

After commitments, review which invariants had warnings or required overrides. This helps refine your invariant configuration.

### 5. Start Strict, Then Relax

Begin with all invariants blocking, then relax specific ones based on actual experience.

## Troubleshooting

### "Cannot modify built-in checkType"

Built-in invariants cannot have their check type changed. Create a custom invariant instead.

### "Invariant not found"

Check that the UUID is correct. Use `GET /invariants` to list all invariants.

### "Cannot delete built-in invariant"

Built-in invariants are protected. You can disable them instead.

### "Config already exists for project"

A project-specific copy already exists. Update the existing copy instead of creating a new one.

## Next Steps

- [Committing Atoms](./committing-atoms.md) - Use invariants in the commitment flow
- [Supersession](./supersession.md) - How to "fix" committed atoms
- [Creating Atoms](./creating-atoms.md) - Create high-quality atoms that pass invariants
