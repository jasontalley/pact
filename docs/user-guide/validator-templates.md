# Validator Templates

This guide explains how to use and create validator templates in Pact.

## What are Validator Templates?

**Validator Templates** are reusable patterns for common validation scenarios. Instead of writing validators from scratch, you can instantiate a template with custom parameters.

Templates provide:

- **Consistency**: Standard patterns across your project
- **Speed**: Quick validator creation
- **Best Practices**: Pre-built patterns from domain experts
- **Discoverability**: Browse templates by category

## Built-in Templates

Pact includes 21 built-in templates across 6 categories:

### Authentication (4 templates)

| Template | Description |
|----------|-------------|
| Authentication Required | User must be authenticated to access resource |
| Role-Based Access | User must have specific role |
| Permission-Based Access | User must have specific permission |
| Session Validity | Session must be valid and not expired |

### Authorization (3 templates)

| Template | Description |
|----------|-------------|
| Resource Ownership | User must own the resource |
| Team Membership | User must be team member |
| Admin-Only Access | Only admins can perform action |

### Data Integrity (5 templates)

| Template | Description |
|----------|-------------|
| Unique Constraint | Field must be unique |
| Referential Integrity | Foreign key must exist |
| Format Validation | Field must match format (email, phone, etc.) |
| Range Validation | Value must be within range |
| Required Fields | Required fields must be present |

### Performance (3 templates)

| Template | Description |
|----------|-------------|
| Response Time | Operation must complete within time limit |
| Throughput | System must handle N requests/second |
| Resource Limits | Operation must not exceed resource limits |

### State Transition (3 templates)

| Template | Description |
|----------|-------------|
| Valid State Transition | State change must be allowed |
| Preconditions | Conditions must be met before action |
| Postconditions | Conditions must be true after action |

### Error Handling (3 templates)

| Template | Description |
|----------|-------------|
| Graceful Failure | System must handle errors gracefully |
| HTTP Status Codes | API must return appropriate status codes |
| Error Messages | Error messages must be informative |

## Browsing Templates

### List All Templates

```bash
curl http://localhost:3000/templates
```

### Filter by Category

```bash
curl http://localhost:3000/templates/category/authentication
```

### Get Available Categories

```bash
curl http://localhost:3000/templates/categories
```

Returns:
```json
[
  { "category": "authentication", "count": 4 },
  { "category": "authorization", "count": 3 },
  { "category": "data-integrity", "count": 5 },
  { "category": "performance", "count": 3 },
  { "category": "state-transition", "count": 3 },
  { "category": "error-handling", "count": 3 }
]
```

### Search Templates

```bash
curl "http://localhost:3000/templates?search=authentication"
```

### Get Popular Tags

```bash
curl http://localhost:3000/templates/tags?limit=10
```

## Instantiating Templates

### View Template Details

First, get the template to understand its parameters:

```bash
curl http://localhost:3000/templates/{templateId}
```

Response:
```json
{
  "id": "template-uuid",
  "name": "Response Time",
  "description": "Validates that an operation completes within a specified time limit",
  "category": "performance",
  "format": "gherkin",
  "templateContent": "Feature: {{operationName}} Performance\n  Scenario: Operation completes within time limit\n    Given the system is under normal load\n    When a user performs {{operationName}}\n    Then the operation should complete within {{timeLimit}}",
  "parametersSchema": {
    "type": "object",
    "properties": {
      "operationName": {
        "type": "string",
        "description": "The name of the operation being measured"
      },
      "timeLimit": {
        "type": "string",
        "description": "Maximum allowed time (e.g., '2 seconds', '500ms')"
      }
    },
    "required": ["operationName", "timeLimit"]
  },
  "exampleUsage": "operationName: 'user login', timeLimit: '2 seconds'",
  "tags": ["performance", "response-time", "latency"]
}
```

### Create Validator from Template

```bash
curl -X POST http://localhost:3000/templates/{templateId}/instantiate \
  -H "Content-Type: application/json" \
  -d '{
    "atomId": "uuid-of-atom",
    "parameters": {
      "operationName": "user login",
      "timeLimit": "2 seconds"
    },
    "name": "Login Response Time Validator"
  }'
```

Response:
```json
{
  "id": "validator-uuid",
  "atomId": "uuid-of-atom",
  "name": "Login Response Time Validator",
  "validatorType": "gherkin",
  "content": "Feature: user login Performance\n  Scenario: Operation completes within time limit\n    Given the system is under normal load\n    When a user performs user login\n    Then the operation should complete within 2 seconds",
  "format": "gherkin",
  "templateId": "template-uuid",
  "parameters": {
    "operationName": "user login",
    "timeLimit": "2 seconds"
  }
}
```

## Creating Custom Templates

### Create a New Template

```bash
curl -X POST http://localhost:3000/templates \
  -H "Content-Type: application/json" \
  -d '{
    "name": "API Rate Limiting",
    "description": "Validates that API endpoints enforce rate limits",
    "category": "performance",
    "format": "gherkin",
    "templateContent": "Feature: {{endpointName}} Rate Limiting\n  Scenario: Rate limit is enforced\n    Given a client has made {{requestLimit}} requests to {{endpointName}}\n    When they make another request within {{timeWindow}}\n    Then the request should be rejected with status 429\n    And the response should include retry-after header",
    "parametersSchema": {
      "type": "object",
      "properties": {
        "endpointName": {
          "type": "string",
          "description": "The API endpoint being rate limited"
        },
        "requestLimit": {
          "type": "number",
          "description": "Maximum requests allowed"
        },
        "timeWindow": {
          "type": "string",
          "description": "Time window for rate limit (e.g., '1 minute')"
        }
      },
      "required": ["endpointName", "requestLimit", "timeWindow"]
    },
    "exampleUsage": "endpointName: '/api/users', requestLimit: 100, timeWindow: '1 minute'",
    "tags": ["performance", "rate-limiting", "api", "security"]
  }'
```

### Template Content Syntax

Use `{{parameterName}}` for placeholder substitution:

```gherkin
Feature: {{featureName}} Validation
  Scenario: {{scenarioDescription}}
    Given {{precondition}}
    When {{action}}
    Then {{expectedResult}}
```

### Parameters Schema

Define parameters using JSON Schema:

```json
{
  "type": "object",
  "properties": {
    "stringParam": {
      "type": "string",
      "description": "A text parameter"
    },
    "numberParam": {
      "type": "number",
      "description": "A numeric parameter",
      "default": 10
    },
    "choiceParam": {
      "type": "string",
      "description": "A parameter with predefined options",
      "enum": ["option1", "option2", "option3"]
    },
    "arrayParam": {
      "type": "array",
      "description": "A list parameter",
      "items": { "type": "string" }
    }
  },
  "required": ["stringParam"]
}
```

## Managing Custom Templates

### Update a Template

Only user-created templates can be modified:

```bash
curl -X PATCH http://localhost:3000/templates/{templateId} \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description",
    "tags": ["updated", "tags"]
  }'
```

### Delete a Template

Only user-created templates can be deleted:

```bash
curl -X DELETE http://localhost:3000/templates/{templateId}
```

**Note**: Built-in templates (`isBuiltin: true`) cannot be modified or deleted.

### View Template Usage

See which validators were created from a template:

```bash
curl http://localhost:3000/templates/{templateId}/usage
```

## Best Practices

### Choosing Templates

1. **Browse by category** to find relevant templates
2. **Read the description** to understand what it validates
3. **Check the parameters** to ensure they fit your needs
4. **Review the example** to see how it's used

### Creating Templates

1. **Be generic** - Templates should work across different contexts
2. **Use clear parameter names** - Make it obvious what each parameter does
3. **Provide good descriptions** - Help users understand the template
4. **Include examples** - Show how to use the template
5. **Add relevant tags** - Improve discoverability
6. **Choose the right format** - Gherkin is most portable

### Template Naming

- Use descriptive names: "Response Time Validation" not "Performance Test"
- Be specific: "Authentication Required" not "Auth Check"
- Follow existing patterns in the category

## Template Statistics

Get insights into template usage:

```bash
curl http://localhost:3000/templates/statistics
```

Returns:
```json
{
  "total": 24,
  "byCategory": {
    "authentication": 4,
    "authorization": 3,
    "data-integrity": 5,
    "performance": 4,
    "state-transition": 3,
    "error-handling": 3,
    "custom": 2
  },
  "byFormat": {
    "gherkin": 20,
    "natural_language": 4
  },
  "builtin": 21,
  "custom": 3,
  "totalUsage": 47
}
```

## Next Steps

- [Creating Validators](./creating-validators.md) - Writing validators manually
- [Creating Atoms](./creating-atoms.md) - Creating Intent Atoms
- [Refinement Workflow](./refinement-workflow.md) - Improving atom quality
