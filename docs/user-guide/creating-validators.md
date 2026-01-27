# Creating Validators

This guide explains how to create validators for Intent Atoms in Pact.

## What is a Validator?

A **Validator** defines testable acceptance criteria for an Intent Atom. Validators give atoms enforceable meaning by specifying exactly how to verify that the atom's intent is satisfied.

Validators can be written in multiple formats:

- **Gherkin** - BDD-style Given/When/Then scenarios
- **Natural Language** - Plain English descriptions
- **TypeScript** - Executable test code
- **JSON** - Structured validation rules

## Creating a Validator via API

### Basic Creation

```bash
curl -X POST http://localhost:3000/validators \
  -H "Content-Type: application/json" \
  -d '{
    "atomId": "uuid-of-atom",
    "name": "Login Response Time",
    "description": "Validates that login completes within the required time",
    "validatorType": "gherkin",
    "content": "Given a registered user\nWhen they submit valid credentials\nThen they are authenticated within 2 seconds",
    "format": "gherkin"
  }'
```

### Validator Types

- **gherkin** - BDD scenarios (Given/When/Then)
- **executable** - Runnable test code
- **declarative** - Rule-based constraints

### Validator Formats

- **gherkin** - Gherkin syntax (Feature/Scenario/Given/When/Then)
- **natural_language** - Plain English description
- **typescript** - Jest/Vitest test code
- **json** - JSON Schema or structured rules

## Writing Good Validators

### Gherkin Format (Recommended)

Gherkin is the recommended format for validators because it's:

- Human-readable
- Translatable to other formats
- Widely understood by stakeholders

```gherkin
Feature: User Authentication Performance
  Scenario: Login completes within time limit
    Given a user with valid credentials
    When they submit the login form
    Then they should be authenticated
    And the response time should be under 2 seconds
```

### Natural Language Format

Use natural language for initial brainstorming or non-technical stakeholders:

```
The system must authenticate users within 2 seconds.
When a user submits valid credentials, they should be
logged in and redirected to the dashboard.
Invalid credentials should be rejected with an error message.
```

### TypeScript Format

For executable validators:

```typescript
describe('User Authentication', () => {
  it('should authenticate within 2 seconds', async () => {
    const start = Date.now();
    const result = await login('user@example.com', 'password');
    const duration = Date.now() - start;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(2000);
  });
});
```

### JSON Format

For structured validation rules:

```json
{
  "name": "Authentication Time Limit",
  "rules": [
    {
      "condition": "login.responseTime",
      "operator": "lessThan",
      "value": 2000,
      "unit": "milliseconds"
    }
  ]
}
```

## Format Translation

Pact can translate validators between formats automatically:

### Translate Existing Validator

```bash
curl -X POST http://localhost:3000/validators/{id}/translate/typescript
```

### Standalone Translation

```bash
curl -X POST http://localhost:3000/validators/translate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Users must be able to login within 2 seconds",
    "sourceFormat": "natural_language",
    "targetFormat": "gherkin"
  }'
```

### Translation Response

```json
{
  "content": "Feature: User Login\n  Scenario: Fast login\n    Given a user with valid credentials\n    When they attempt to login\n    Then they should be authenticated within 2 seconds",
  "sourceFormat": "natural_language",
  "targetFormat": "gherkin",
  "confidence": 0.92,
  "warnings": [],
  "wasLLMUsed": true
}
```

### Understanding Confidence Scores

- **0.95+** - High confidence, translation is reliable
- **0.80-0.94** - Good confidence, review recommended
- **0.60-0.79** - Medium confidence, manual review required
- **< 0.60** - Low confidence, consider rewriting

## Validator Lifecycle

```
active ←→ inactive
   ↓
(deleted)
```

- **Active**: Validator is enabled and counts toward atom validation
- **Inactive**: Validator is disabled but preserved for history
- **Deleted**: Removed from the system (soft delete sets inactive)

### Activate/Deactivate

```bash
# Deactivate
curl -X PATCH http://localhost:3000/validators/{id}/deactivate

# Activate
curl -X PATCH http://localhost:3000/validators/{id}/activate
```

## Creating from Templates

Use templates for common validation patterns:

```bash
# List available templates
curl http://localhost:3000/templates

# Instantiate a template
curl -X POST http://localhost:3000/templates/{templateId}/instantiate \
  -H "Content-Type: application/json" \
  -d '{
    "atomId": "uuid-of-atom",
    "parameters": {
      "timeLimit": "2 seconds",
      "operation": "login"
    }
  }'
```

See [Validator Templates](./validator-templates.md) for more details.

## Best Practices

### Do

- **Be specific**: Include measurable criteria
- **Focus on behavior**: Describe what happens, not how
- **Keep it atomic**: One validator per testable behavior
- **Use Gherkin**: It's the most portable format
- **Add descriptions**: Explain what and why

### Don't

- **Avoid vague assertions**: "should work correctly"
- **Don't mix concerns**: One validator per behavior
- **Don't include implementation**: Focus on outcomes
- **Don't skip edge cases**: Cover boundary conditions

## Examples

### Good Validator (Gherkin)

```json
{
  "atomId": "uuid-of-auth-atom",
  "name": "Password Reset Token Expiry",
  "description": "Validates that password reset tokens expire after 15 minutes",
  "validatorType": "gherkin",
  "format": "gherkin",
  "content": "Feature: Password Reset Security\n  Scenario: Token expires after 15 minutes\n    Given a password reset token was generated at 10:00\n    When the user attempts to use it at 10:16\n    Then the token should be rejected\n    And an error message should indicate the token has expired\n\n  Scenario: Token is valid within 15 minutes\n    Given a password reset token was generated at 10:00\n    When the user attempts to use it at 10:14\n    Then the token should be accepted"
}
```

### Needs Improvement

```json
{
  "atomId": "uuid-of-auth-atom",
  "name": "Security Check",
  "validatorType": "gherkin",
  "format": "natural_language",
  "content": "The system should be secure"
}
```

**Why**: Too vague, no specific behavior, no measurable criteria.

## Querying Validators

### List Validators for an Atom

```bash
curl http://localhost:3000/validators?atomId={atomId}
```

### Filter by Type and Status

```bash
curl "http://localhost:3000/validators?validatorType=gherkin&isActive=true"
```

### Search by Content

```bash
curl "http://localhost:3000/validators?search=authentication"
```

## Next Steps

- [Validator Templates](./validator-templates.md) - Using pre-built validation patterns
- [Creating Atoms](./creating-atoms.md) - Creating Intent Atoms
- [Refinement Workflow](./refinement-workflow.md) - Improving atom quality
