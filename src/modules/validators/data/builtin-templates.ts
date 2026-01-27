import { ValidatorFormat } from '../validator.entity';
import { TemplateCategory, ParameterSchema } from '../validator-template.entity';

/**
 * Built-in validator template definition
 */
export interface BuiltinTemplateDefinition {
  name: string;
  description: string;
  category: TemplateCategory;
  format: ValidatorFormat;
  templateContent: string;
  parametersSchema: ParameterSchema;
  exampleUsage: string;
  tags: string[];
}

/**
 * Built-in validator templates for common validation patterns.
 * These templates are seeded into the database on application startup
 * and provide reusable patterns for authentication, authorization,
 * data integrity, performance, state transitions, and error handling.
 *
 * @atom IA-PHASE2-010 Built-in template library for common validation patterns
 */
export const BUILTIN_TEMPLATES: BuiltinTemplateDefinition[] = [
  // ============================================
  // AUTHENTICATION TEMPLATES (4)
  // ============================================

  {
    name: 'Authentication Required',
    description:
      'Validates that a user must be authenticated to access a resource or perform an action. ' +
      'This is the most basic authentication check.',
    category: 'authentication',
    format: 'gherkin',
    templateContent: `Feature: Authentication Required for {{resourceName}}

  Scenario: Authenticated user can access {{resourceName}}
    Given a user is authenticated
    When they attempt to access {{resourceName}}
    Then access is granted
    And the user session is valid

  Scenario: Unauthenticated user cannot access {{resourceName}}
    Given a user is not authenticated
    When they attempt to access {{resourceName}}
    Then access is denied
    And they receive an authentication error
    And they are redirected to login`,
    parametersSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'The name of the resource or action requiring authentication',
        },
      },
      required: ['resourceName'],
    },
    exampleUsage: `// Using the template with resourceName = "user profile"
Feature: Authentication Required for user profile

  Scenario: Authenticated user can access user profile
    Given a user is authenticated
    When they attempt to access user profile
    Then access is granted`,
    tags: ['authentication', 'security', 'access-control', 'login'],
  },

  {
    name: 'Role-Based Access',
    description:
      'Validates that a user must have a specific role to access a resource or perform an action. ' +
      'Supports single role or multiple allowed roles.',
    category: 'authentication',
    format: 'gherkin',
    templateContent: `Feature: Role-Based Access for {{resourceName}}

  Scenario: User with {{roleName}} role can access {{resourceName}}
    Given a user is authenticated
    And the user has the "{{roleName}}" role
    When they attempt to access {{resourceName}}
    Then access is granted

  Scenario: User without {{roleName}} role cannot access {{resourceName}}
    Given a user is authenticated
    And the user does not have the "{{roleName}}" role
    When they attempt to access {{resourceName}}
    Then access is denied
    And they receive an authorization error with message "Insufficient permissions"

  Scenario: Unauthenticated user cannot access {{resourceName}}
    Given a user is not authenticated
    When they attempt to access {{resourceName}}
    Then access is denied
    And they receive an authentication error`,
    parametersSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'The name of the resource or action requiring the role',
        },
        roleName: {
          type: 'string',
          description: 'The required role name (e.g., "admin", "moderator")',
        },
      },
      required: ['resourceName', 'roleName'],
    },
    exampleUsage: `// Using the template with resourceName = "admin dashboard", roleName = "admin"
Feature: Role-Based Access for admin dashboard

  Scenario: User with admin role can access admin dashboard
    Given a user is authenticated
    And the user has the "admin" role
    When they attempt to access admin dashboard
    Then access is granted`,
    tags: ['authentication', 'authorization', 'rbac', 'roles', 'security'],
  },

  {
    name: 'Permission-Based Access',
    description:
      'Validates that a user must have a specific permission to perform an action. ' +
      'More granular than role-based access, allowing fine-grained control.',
    category: 'authentication',
    format: 'gherkin',
    templateContent: `Feature: Permission-Based Access for {{actionName}}

  Scenario: User with {{permissionName}} permission can {{actionName}}
    Given a user is authenticated
    And the user has the "{{permissionName}}" permission
    When they attempt to {{actionName}}
    Then the action is allowed
    And the operation completes successfully

  Scenario: User without {{permissionName}} permission cannot {{actionName}}
    Given a user is authenticated
    And the user does not have the "{{permissionName}}" permission
    When they attempt to {{actionName}}
    Then the action is denied
    And they receive a forbidden error
    And the operation is not executed

  Scenario: Permission check is logged for audit
    Given a user is authenticated
    When they attempt to {{actionName}}
    Then the permission check is logged
    And the log contains the user ID, permission name, and result`,
    parametersSchema: {
      type: 'object',
      properties: {
        actionName: {
          type: 'string',
          description: 'The action that requires the permission',
        },
        permissionName: {
          type: 'string',
          description: 'The required permission name (e.g., "users:write", "reports:read")',
        },
      },
      required: ['actionName', 'permissionName'],
    },
    exampleUsage: `// Using the template with actionName = "delete users", permissionName = "users:delete"
Feature: Permission-Based Access for delete users

  Scenario: User with users:delete permission can delete users
    Given a user is authenticated
    And the user has the "users:delete" permission
    When they attempt to delete users
    Then the action is allowed`,
    tags: ['authentication', 'authorization', 'permissions', 'security', 'audit'],
  },

  {
    name: 'Session Validity',
    description:
      'Validates that a user session must be valid and not expired. ' +
      'Ensures proper session lifecycle management.',
    category: 'authentication',
    format: 'gherkin',
    templateContent: `Feature: Session Validity for {{resourceName}}

  Scenario: Valid session allows access to {{resourceName}}
    Given a user has an active session
    And the session was created within the last {{sessionDuration}} minutes
    When they attempt to access {{resourceName}}
    Then access is granted
    And the session is refreshed

  Scenario: Expired session denies access to {{resourceName}}
    Given a user has a session
    And the session was created more than {{sessionDuration}} minutes ago
    When they attempt to access {{resourceName}}
    Then access is denied
    And they receive a session expired error
    And they are required to re-authenticate

  Scenario: Invalid session token denies access
    Given a user presents an invalid session token
    When they attempt to access {{resourceName}}
    Then access is denied
    And the invalid token is logged for security monitoring

  Scenario: Revoked session denies access
    Given a user had a valid session
    And the session was revoked by an administrator
    When they attempt to access {{resourceName}}
    Then access is denied
    And they are notified of session revocation`,
    parametersSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'The name of the resource requiring valid session',
        },
        sessionDuration: {
          type: 'number',
          description: 'Maximum session duration in minutes before expiration',
          default: 30,
        },
      },
      required: ['resourceName'],
    },
    exampleUsage: `// Using the template with resourceName = "API endpoints", sessionDuration = 60
Feature: Session Validity for API endpoints

  Scenario: Valid session allows access to API endpoints
    Given a user has an active session
    And the session was created within the last 60 minutes
    When they attempt to access API endpoints
    Then access is granted`,
    tags: ['authentication', 'session', 'security', 'token', 'expiration'],
  },

  // ============================================
  // AUTHORIZATION TEMPLATES (3)
  // ============================================

  {
    name: 'Resource Ownership',
    description:
      'Validates that a user must own a resource to perform actions on it. ' +
      'Ensures users can only modify their own data.',
    category: 'authorization',
    format: 'gherkin',
    templateContent: `Feature: Resource Ownership for {{resourceType}}

  Scenario: Owner can {{actionName}} their {{resourceType}}
    Given a user is authenticated
    And the user is the owner of the {{resourceType}}
    When they attempt to {{actionName}} the {{resourceType}}
    Then the action is allowed
    And the {{resourceType}} is updated successfully

  Scenario: Non-owner cannot {{actionName}} someone else's {{resourceType}}
    Given a user is authenticated
    And the user is not the owner of the {{resourceType}}
    When they attempt to {{actionName}} the {{resourceType}}
    Then the action is denied
    And they receive a forbidden error with message "You can only modify your own resources"

  Scenario: Admin can {{actionName}} any {{resourceType}}
    Given a user is authenticated
    And the user has the "admin" role
    When they attempt to {{actionName}} any {{resourceType}}
    Then the action is allowed
    And the admin action is logged for audit`,
    parametersSchema: {
      type: 'object',
      properties: {
        resourceType: {
          type: 'string',
          description: 'The type of resource (e.g., "profile", "document", "post")',
        },
        actionName: {
          type: 'string',
          description: 'The action being performed (e.g., "edit", "delete", "update")',
        },
      },
      required: ['resourceType', 'actionName'],
    },
    exampleUsage: `// Using the template with resourceType = "profile", actionName = "edit"
Feature: Resource Ownership for profile

  Scenario: Owner can edit their profile
    Given a user is authenticated
    And the user is the owner of the profile
    When they attempt to edit the profile
    Then the action is allowed`,
    tags: ['authorization', 'ownership', 'security', 'resources'],
  },

  {
    name: 'Team Membership',
    description:
      'Validates that a user must be a member of a team to access team resources. ' +
      'Supports team-based collaboration scenarios.',
    category: 'authorization',
    format: 'gherkin',
    templateContent: `Feature: Team Membership for {{resourceType}}

  Scenario: Team member can access {{resourceType}}
    Given a user is authenticated
    And the user is a member of the "{{teamName}}" team
    When they attempt to access the {{resourceType}}
    Then access is granted
    And they can view all {{resourceType}} data

  Scenario: Non-team member cannot access {{resourceType}}
    Given a user is authenticated
    And the user is not a member of the "{{teamName}}" team
    When they attempt to access the {{resourceType}}
    Then access is denied
    And they receive a message "You are not a member of this team"

  Scenario: Team admin can manage {{resourceType}}
    Given a user is authenticated
    And the user is an admin of the "{{teamName}}" team
    When they attempt to manage the {{resourceType}}
    Then full management access is granted
    And they can add, edit, and delete {{resourceType}}

  Scenario: User can see only their team memberships
    Given a user is authenticated
    When they request their team memberships
    Then they see only teams they belong to
    And hidden teams are not visible`,
    parametersSchema: {
      type: 'object',
      properties: {
        resourceType: {
          type: 'string',
          description: 'The type of team resource (e.g., "project", "workspace", "document")',
        },
        teamName: {
          type: 'string',
          description: 'The name or identifier of the team',
        },
      },
      required: ['resourceType', 'teamName'],
    },
    exampleUsage: `// Using the template with resourceType = "project files", teamName = "Engineering"
Feature: Team Membership for project files

  Scenario: Team member can access project files
    Given a user is authenticated
    And the user is a member of the "Engineering" team
    When they attempt to access the project files
    Then access is granted`,
    tags: ['authorization', 'teams', 'collaboration', 'membership'],
  },

  {
    name: 'Admin-Only Access',
    description:
      'Validates that only administrators can perform sensitive operations. ' +
      'Used for system configuration and user management.',
    category: 'authorization',
    format: 'gherkin',
    templateContent: `Feature: Admin-Only Access for {{operationName}}

  Scenario: Admin can {{operationName}}
    Given a user is authenticated
    And the user has administrator privileges
    When they attempt to {{operationName}}
    Then the operation is allowed
    And the action is logged in the admin audit trail
    And a notification is sent to security monitoring

  Scenario: Non-admin cannot {{operationName}}
    Given a user is authenticated
    And the user does not have administrator privileges
    When they attempt to {{operationName}}
    Then the operation is denied
    And they receive an error "This operation requires administrator access"
    And the unauthorized attempt is logged

  Scenario: Super admin can perform operation without restrictions
    Given a user is authenticated
    And the user has super administrator privileges
    When they attempt to {{operationName}}
    Then the operation is allowed
    And no approval workflow is required

  Scenario: Admin action requires confirmation for {{operationName}}
    Given a user is authenticated as an administrator
    When they attempt to {{operationName}}
    Then they must confirm the action
    And a record is created in the audit log`,
    parametersSchema: {
      type: 'object',
      properties: {
        operationName: {
          type: 'string',
          description:
            'The administrative operation (e.g., "delete user accounts", "modify system settings")',
        },
      },
      required: ['operationName'],
    },
    exampleUsage: `// Using the template with operationName = "delete user accounts"
Feature: Admin-Only Access for delete user accounts

  Scenario: Admin can delete user accounts
    Given a user is authenticated
    And the user has administrator privileges
    When they attempt to delete user accounts
    Then the operation is allowed`,
    tags: ['authorization', 'admin', 'security', 'privileged', 'audit'],
  },

  // ============================================
  // DATA INTEGRITY TEMPLATES (5)
  // ============================================

  {
    name: 'Unique Constraint',
    description:
      'Validates that a field value must be unique across all records. ' +
      'Prevents duplicate entries for fields like email, username, or code.',
    category: 'data-integrity',
    format: 'gherkin',
    templateContent: `Feature: Unique Constraint for {{fieldName}} in {{entityName}}

  Scenario: Create {{entityName}} with unique {{fieldName}}
    Given no {{entityName}} exists with {{fieldName}} "{{exampleValue}}"
    When a new {{entityName}} is created with {{fieldName}} "{{exampleValue}}"
    Then the {{entityName}} is created successfully
    And the {{fieldName}} is stored as "{{exampleValue}}"

  Scenario: Reject duplicate {{fieldName}} for {{entityName}}
    Given a {{entityName}} exists with {{fieldName}} "{{exampleValue}}"
    When another {{entityName}} is created with {{fieldName}} "{{exampleValue}}"
    Then the creation fails
    And an error is returned with message "{{fieldName}} must be unique"
    And the duplicate {{entityName}} is not created

  Scenario: Update {{entityName}} with same {{fieldName}} succeeds
    Given a {{entityName}} exists with {{fieldName}} "{{exampleValue}}"
    When the same {{entityName}} is updated with {{fieldName}} "{{exampleValue}}"
    Then the update succeeds
    And no uniqueness error is raised

  Scenario: Case-insensitive uniqueness check for {{fieldName}}
    Given a {{entityName}} exists with {{fieldName}} "{{exampleValue}}"
    When another {{entityName}} is created with {{fieldName}} "{{exampleValue}}" in different case
    Then the creation fails
    And the uniqueness check is case-insensitive`,
    parametersSchema: {
      type: 'object',
      properties: {
        entityName: {
          type: 'string',
          description: 'The entity type (e.g., "User", "Product", "Organization")',
        },
        fieldName: {
          type: 'string',
          description: 'The field that must be unique (e.g., "email", "username", "code")',
        },
        exampleValue: {
          type: 'string',
          description: 'An example value for the field',
          default: 'example@test.com',
        },
      },
      required: ['entityName', 'fieldName'],
    },
    exampleUsage: `// Using the template with entityName = "User", fieldName = "email"
Feature: Unique Constraint for email in User

  Scenario: Create User with unique email
    Given no User exists with email "test@example.com"
    When a new User is created with email "test@example.com"
    Then the User is created successfully`,
    tags: ['data-integrity', 'uniqueness', 'validation', 'database', 'constraints'],
  },

  {
    name: 'Referential Integrity',
    description:
      'Validates that foreign key references must point to existing records. ' +
      'Ensures data consistency across related entities.',
    category: 'data-integrity',
    format: 'gherkin',
    templateContent: `Feature: Referential Integrity for {{childEntity}} to {{parentEntity}}

  Scenario: Create {{childEntity}} with valid {{parentEntity}} reference
    Given a {{parentEntity}} exists with ID "{{parentId}}"
    When a {{childEntity}} is created referencing {{parentEntity}} "{{parentId}}"
    Then the {{childEntity}} is created successfully
    And the {{foreignKeyField}} points to the valid {{parentEntity}}

  Scenario: Reject {{childEntity}} with invalid {{parentEntity}} reference
    Given no {{parentEntity}} exists with ID "invalid-id"
    When a {{childEntity}} is created referencing {{parentEntity}} "invalid-id"
    Then the creation fails
    And an error is returned with message "Referenced {{parentEntity}} does not exist"

  Scenario: Cascade delete removes {{childEntity}} when {{parentEntity}} is deleted
    Given a {{parentEntity}} exists with ID "{{parentId}}"
    And a {{childEntity}} exists referencing {{parentEntity}} "{{parentId}}"
    When the {{parentEntity}} is deleted
    Then the {{childEntity}} is also deleted
    And no orphan records remain

  Scenario: Restrict delete when {{childEntity}} references {{parentEntity}}
    Given a {{parentEntity}} exists with ID "{{parentId}}"
    And a {{childEntity}} exists referencing {{parentEntity}} "{{parentId}}"
    When attempting to delete the {{parentEntity}}
    Then the deletion is prevented
    And an error is returned with message "Cannot delete: referenced by {{childEntity}}"`,
    parametersSchema: {
      type: 'object',
      properties: {
        childEntity: {
          type: 'string',
          description: 'The entity containing the foreign key (e.g., "Order", "Comment")',
        },
        parentEntity: {
          type: 'string',
          description: 'The referenced entity (e.g., "User", "Post")',
        },
        foreignKeyField: {
          type: 'string',
          description: 'The foreign key field name (e.g., "userId", "postId")',
        },
        parentId: {
          type: 'string',
          description: 'Example parent ID for testing',
          default: 'parent-123',
        },
      },
      required: ['childEntity', 'parentEntity', 'foreignKeyField'],
    },
    exampleUsage: `// Using the template with childEntity = "Order", parentEntity = "User", foreignKeyField = "userId"
Feature: Referential Integrity for Order to User

  Scenario: Create Order with valid User reference
    Given a User exists with ID "user-123"
    When a Order is created referencing User "user-123"
    Then the Order is created successfully`,
    tags: ['data-integrity', 'foreign-key', 'relationships', 'database', 'constraints'],
  },

  {
    name: 'Format Validation',
    description:
      'Validates that a field must match a specific format pattern. ' +
      'Common for email, phone, URL, or custom format validation.',
    category: 'data-integrity',
    format: 'gherkin',
    templateContent: `Feature: Format Validation for {{fieldName}}

  Scenario: Accept valid {{formatType}} format for {{fieldName}}
    Given a valid {{formatType}} value "{{validExample}}"
    When the {{fieldName}} is set to "{{validExample}}"
    Then the value is accepted
    And no validation error is raised

  Scenario: Reject invalid {{formatType}} format for {{fieldName}}
    Given an invalid {{formatType}} value "{{invalidExample}}"
    When the {{fieldName}} is set to "{{invalidExample}}"
    Then the value is rejected
    And an error is returned with message "{{fieldName}} must be a valid {{formatType}}"

  Scenario: Handle empty {{fieldName}} appropriately
    Given an empty value for {{fieldName}}
    When the {{fieldName}} is validated
    Then the empty value handling follows required/optional rules
    And appropriate error or acceptance is returned

  Scenario: Trim whitespace from {{fieldName}}
    Given a {{formatType}} value with leading/trailing whitespace
    When the {{fieldName}} is set with whitespace
    Then the whitespace is trimmed
    And the cleaned value is validated`,
    parametersSchema: {
      type: 'object',
      properties: {
        fieldName: {
          type: 'string',
          description: 'The field being validated (e.g., "email", "phone", "url")',
        },
        formatType: {
          type: 'string',
          description: 'The format type (e.g., "email", "phone", "URL", "UUID")',
          enum: ['email', 'phone', 'URL', 'UUID', 'date', 'credit-card', 'postal-code'],
        },
        validExample: {
          type: 'string',
          description: 'An example of a valid value',
        },
        invalidExample: {
          type: 'string',
          description: 'An example of an invalid value',
        },
      },
      required: ['fieldName', 'formatType', 'validExample', 'invalidExample'],
    },
    exampleUsage: `// Using the template with fieldName = "email", formatType = "email"
Feature: Format Validation for email

  Scenario: Accept valid email format for email
    Given a valid email value "user@example.com"
    When the email is set to "user@example.com"
    Then the value is accepted`,
    tags: ['data-integrity', 'validation', 'format', 'email', 'phone'],
  },

  {
    name: 'Range Validation',
    description:
      'Validates that a numeric value must be within a specified range. ' +
      'Used for age, quantity, price, and other bounded values.',
    category: 'data-integrity',
    format: 'gherkin',
    templateContent: `Feature: Range Validation for {{fieldName}}

  Scenario: Accept {{fieldName}} within valid range
    Given a {{fieldName}} value of {{validValue}}
    When the {{fieldName}} is validated
    Then the value is accepted
    And no validation error is raised

  Scenario: Reject {{fieldName}} below minimum
    Given a {{fieldName}} value of {{belowMin}}
    When the {{fieldName}} is validated
    Then the value is rejected
    And an error is returned with message "{{fieldName}} must be at least {{minValue}}"

  Scenario: Reject {{fieldName}} above maximum
    Given a {{fieldName}} value of {{aboveMax}}
    When the {{fieldName}} is validated
    Then the value is rejected
    And an error is returned with message "{{fieldName}} must be at most {{maxValue}}"

  Scenario: Accept boundary values for {{fieldName}}
    Given boundary values {{minValue}} and {{maxValue}}
    When the {{fieldName}} is set to {{minValue}}
    Then the minimum boundary value is accepted
    When the {{fieldName}} is set to {{maxValue}}
    Then the maximum boundary value is accepted`,
    parametersSchema: {
      type: 'object',
      properties: {
        fieldName: {
          type: 'string',
          description: 'The field being validated (e.g., "age", "quantity", "price")',
        },
        minValue: {
          type: 'number',
          description: 'Minimum allowed value (inclusive)',
        },
        maxValue: {
          type: 'number',
          description: 'Maximum allowed value (inclusive)',
        },
        validValue: {
          type: 'number',
          description: 'An example valid value within range',
        },
        belowMin: {
          type: 'number',
          description: 'An example value below minimum',
        },
        aboveMax: {
          type: 'number',
          description: 'An example value above maximum',
        },
      },
      required: ['fieldName', 'minValue', 'maxValue'],
    },
    exampleUsage: `// Using the template with fieldName = "age", minValue = 18, maxValue = 120
Feature: Range Validation for age

  Scenario: Accept age within valid range
    Given a age value of 25
    When the age is validated
    Then the value is accepted`,
    tags: ['data-integrity', 'validation', 'range', 'numeric', 'boundaries'],
  },

  {
    name: 'Required Fields',
    description:
      'Validates that required fields must be present and non-empty. ' +
      'Ensures critical data is provided before processing.',
    category: 'data-integrity',
    format: 'gherkin',
    templateContent: `Feature: Required Fields for {{entityName}}

  Scenario: Accept {{entityName}} with all required fields present
    Given all required fields are provided: {{requiredFields}}
    When the {{entityName}} is created
    Then the {{entityName}} is created successfully
    And all required fields are stored correctly

  Scenario: Reject {{entityName}} with missing required field
    Given the required field "{{primaryField}}" is missing
    When the {{entityName}} is created
    Then the creation fails
    And an error is returned with message "{{primaryField}} is required"

  Scenario: Reject {{entityName}} with empty required field
    Given the required field "{{primaryField}}" is empty
    When the {{entityName}} is created
    Then the creation fails
    And an error is returned with message "{{primaryField}} cannot be empty"

  Scenario: Accept {{entityName}} with optional fields missing
    Given required fields {{requiredFields}} are provided
    And optional fields are not provided
    When the {{entityName}} is created
    Then the {{entityName}} is created successfully
    And optional fields have default values

  Scenario: Validate all required fields in single request
    Given multiple required fields from {{requiredFields}} are missing
    When the {{entityName}} is created
    Then the creation fails
    And all missing fields are listed in the error response`,
    parametersSchema: {
      type: 'object',
      properties: {
        entityName: {
          type: 'string',
          description: 'The entity being validated (e.g., "User", "Order", "Product")',
        },
        requiredFields: {
          type: 'array',
          description: 'List of required field names',
          items: { type: 'string' },
        },
        primaryField: {
          type: 'string',
          description: 'The primary required field for examples',
        },
      },
      required: ['entityName', 'requiredFields', 'primaryField'],
    },
    exampleUsage: `// Using the template with entityName = "User", requiredFields = "email, name", primaryField = "email"
Feature: Required Fields for User

  Scenario: Accept User with all required fields present
    Given all required fields are provided: email, name
    When the User is created
    Then the User is created successfully`,
    tags: ['data-integrity', 'validation', 'required', 'mandatory', 'fields'],
  },

  // ============================================
  // PERFORMANCE TEMPLATES (3)
  // ============================================

  {
    name: 'Response Time',
    description:
      'Validates that an operation must complete within a specified time limit. ' +
      'Used for API endpoints, database queries, and user-facing operations.',
    category: 'performance',
    format: 'gherkin',
    templateContent: `Feature: Response Time for {{operationName}}

  Scenario: {{operationName}} completes within time limit
    Given the system is under normal load
    When {{operationName}} is executed
    Then the operation completes within {{maxDuration}} {{timeUnit}}
    And the response is returned to the caller

  Scenario: {{operationName}} times out gracefully
    Given the system is under heavy load
    When {{operationName}} exceeds {{maxDuration}} {{timeUnit}}
    Then a timeout error is returned
    And partial results are not returned
    And resources are cleaned up properly

  Scenario: {{operationName}} performance under load
    Given {{concurrentUsers}} concurrent users
    When each user executes {{operationName}}
    Then 95th percentile response time is under {{p95Duration}} {{timeUnit}}
    And no requests fail due to timeout

  Scenario: Monitor {{operationName}} performance
    When {{operationName}} is executed
    Then the execution time is logged
    And performance metrics are recorded
    And slow operations are flagged for investigation`,
    parametersSchema: {
      type: 'object',
      properties: {
        operationName: {
          type: 'string',
          description: 'The operation being measured (e.g., "user login", "search query")',
        },
        maxDuration: {
          type: 'number',
          description: 'Maximum allowed duration',
        },
        timeUnit: {
          type: 'string',
          description: 'Time unit for measurements',
          enum: ['milliseconds', 'seconds', 'minutes'],
          default: 'milliseconds',
        },
        concurrentUsers: {
          type: 'number',
          description: 'Number of concurrent users for load testing',
          default: 100,
        },
        p95Duration: {
          type: 'number',
          description: '95th percentile target duration',
        },
      },
      required: ['operationName', 'maxDuration'],
    },
    exampleUsage: `// Using the template with operationName = "API request", maxDuration = 200
Feature: Response Time for API request

  Scenario: API request completes within time limit
    Given the system is under normal load
    When API request is executed
    Then the operation completes within 200 milliseconds`,
    tags: ['performance', 'latency', 'sla', 'response-time', 'monitoring'],
  },

  {
    name: 'Throughput',
    description:
      'Validates that the system must handle a minimum number of requests per time unit. ' +
      'Used for capacity planning and SLA verification.',
    category: 'performance',
    format: 'gherkin',
    templateContent: `Feature: Throughput for {{systemName}}

  Scenario: {{systemName}} handles minimum throughput
    Given the system is running in production configuration
    When {{requestCount}} {{requestType}} are submitted per {{timeUnit}}
    Then all requests are processed successfully
    And no requests are dropped
    And error rate is below {{maxErrorRate}}%

  Scenario: {{systemName}} scales under increasing load
    Given the system starts with {{baseLoad}} requests per {{timeUnit}}
    When load increases to {{peakLoad}} requests per {{timeUnit}}
    Then the system continues to process requests
    And response times remain within acceptable limits
    And auto-scaling triggers if configured

  Scenario: {{systemName}} recovers from traffic spike
    Given a traffic spike of {{spikeMultiplier}}x normal load
    When the spike subsides
    Then the system returns to normal operation
    And no data is lost during the spike
    And queued requests are eventually processed

  Scenario: {{systemName}} maintains throughput during deployment
    Given a deployment is in progress
    When requests continue to arrive
    Then at least {{minAvailability}}% of requests succeed
    And zero-downtime deployment is achieved`,
    parametersSchema: {
      type: 'object',
      properties: {
        systemName: {
          type: 'string',
          description:
            'The system or service being measured (e.g., "Order API", "Payment Gateway")',
        },
        requestCount: {
          type: 'number',
          description: 'Minimum requests to handle',
        },
        requestType: {
          type: 'string',
          description: 'Type of requests (e.g., "orders", "API calls", "messages")',
        },
        timeUnit: {
          type: 'string',
          description: 'Time unit for throughput',
          enum: ['second', 'minute', 'hour'],
          default: 'second',
        },
        maxErrorRate: {
          type: 'number',
          description: 'Maximum acceptable error rate percentage',
          default: 1,
        },
        baseLoad: {
          type: 'number',
          description: 'Baseline load for scaling tests',
        },
        peakLoad: {
          type: 'number',
          description: 'Peak load for scaling tests',
        },
        spikeMultiplier: {
          type: 'number',
          description: 'Traffic spike multiplier (e.g., 10 for 10x)',
          default: 10,
        },
        minAvailability: {
          type: 'number',
          description: 'Minimum availability percentage during deployment',
          default: 99.9,
        },
      },
      required: ['systemName', 'requestCount', 'requestType'],
    },
    exampleUsage: `// Using the template with systemName = "Order API", requestCount = 1000
Feature: Throughput for Order API

  Scenario: Order API handles minimum throughput
    Given the system is running in production configuration
    When 1000 orders are submitted per second
    Then all requests are processed successfully`,
    tags: ['performance', 'throughput', 'scalability', 'load-testing', 'capacity'],
  },

  {
    name: 'Resource Limits',
    description:
      'Validates that operations must not exceed specified resource limits. ' +
      'Used for memory, CPU, disk, and network constraints.',
    category: 'performance',
    format: 'gherkin',
    templateContent: `Feature: Resource Limits for {{operationName}}

  Scenario: {{operationName}} stays within {{resourceType}} limit
    Given a {{resourceType}} limit of {{maxValue}} {{unit}}
    When {{operationName}} is executed
    Then {{resourceType}} usage stays below {{maxValue}} {{unit}}
    And the operation completes successfully

  Scenario: {{operationName}} handles {{resourceType}} limit reached
    Given {{resourceType}} is near the limit
    When {{operationName}} would exceed the limit
    Then the operation is rejected or queued
    And an appropriate error message is returned
    And existing operations are not affected

  Scenario: {{operationName}} releases {{resourceType}} after completion
    When {{operationName}} completes
    Then allocated {{resourceType}} is released
    And no {{resourceType}} leaks occur
    And {{resourceType}} returns to baseline

  Scenario: Monitor {{resourceType}} usage for {{operationName}}
    When {{operationName}} is executed
    Then {{resourceType}} usage is tracked
    And alerts trigger at {{alertThreshold}}% of limit
    And metrics are available for analysis`,
    parametersSchema: {
      type: 'object',
      properties: {
        operationName: {
          type: 'string',
          description: 'The operation being constrained (e.g., "file upload", "batch process")',
        },
        resourceType: {
          type: 'string',
          description: 'The resource being limited (e.g., "memory", "CPU", "disk", "connections")',
          enum: ['memory', 'CPU', 'disk', 'connections', 'bandwidth'],
        },
        maxValue: {
          type: 'number',
          description: 'Maximum allowed resource usage',
        },
        unit: {
          type: 'string',
          description: 'Unit of measurement (e.g., "MB", "%", "GB", "count")',
        },
        alertThreshold: {
          type: 'number',
          description: 'Percentage threshold for alerts',
          default: 80,
        },
      },
      required: ['operationName', 'resourceType', 'maxValue', 'unit'],
    },
    exampleUsage: `// Using the template with operationName = "file upload", resourceType = "memory"
Feature: Resource Limits for file upload

  Scenario: file upload stays within memory limit
    Given a memory limit of 512 MB
    When file upload is executed
    Then memory usage stays below 512 MB`,
    tags: ['performance', 'resources', 'limits', 'memory', 'cpu', 'monitoring'],
  },

  // ============================================
  // STATE TRANSITION TEMPLATES (3)
  // ============================================

  {
    name: 'Valid State Transition',
    description:
      'Validates that state changes must follow defined transition rules. ' +
      'Used for workflow, order status, and lifecycle management.',
    category: 'state-transition',
    format: 'gherkin',
    templateContent: `Feature: Valid State Transitions for {{entityName}}

  Scenario: {{entityName}} transitions from {{fromState}} to {{toState}}
    Given a {{entityName}} in "{{fromState}}" state
    When the transition to "{{toState}}" is requested
    Then the transition is allowed
    And the {{entityName}} state becomes "{{toState}}"
    And the state change is recorded with timestamp

  Scenario: Invalid transition from {{fromState}} to {{invalidState}} is rejected
    Given a {{entityName}} in "{{fromState}}" state
    When the transition to "{{invalidState}}" is requested
    Then the transition is rejected
    And an error is returned with message "Invalid transition from {{fromState}} to {{invalidState}}"
    And the {{entityName}} remains in "{{fromState}}" state

  Scenario: State transition triggers side effects
    Given a {{entityName}} in "{{fromState}}" state
    When the transition to "{{toState}}" is completed
    Then appropriate notifications are sent
    And related entities are updated
    And audit log is created

  Scenario: Concurrent state transitions are handled safely
    Given multiple requests to change {{entityName}} state
    When transitions are attempted simultaneously
    Then only one transition succeeds
    And other requests receive conflict error
    And data integrity is maintained`,
    parametersSchema: {
      type: 'object',
      properties: {
        entityName: {
          type: 'string',
          description: 'The entity with state (e.g., "Order", "Task", "Document")',
        },
        fromState: {
          type: 'string',
          description: 'The starting state',
        },
        toState: {
          type: 'string',
          description: 'The target state (valid transition)',
        },
        invalidState: {
          type: 'string',
          description: 'An invalid target state from the starting state',
        },
      },
      required: ['entityName', 'fromState', 'toState', 'invalidState'],
    },
    exampleUsage: `// Using the template with entityName = "Order", fromState = "pending"
Feature: Valid State Transitions for Order

  Scenario: Order transitions from pending to confirmed
    Given a Order in "pending" state
    When the transition to "confirmed" is requested
    Then the transition is allowed`,
    tags: ['state-machine', 'workflow', 'transitions', 'lifecycle', 'status'],
  },

  {
    name: 'Preconditions',
    description:
      'Validates that specific conditions must be met before an action can be performed. ' +
      'Ensures business rules are satisfied before state changes.',
    category: 'state-transition',
    format: 'gherkin',
    templateContent: `Feature: Preconditions for {{actionName}}

  Scenario: {{actionName}} succeeds when preconditions are met
    Given the following preconditions are satisfied:
      | condition | status |
      | {{precondition1}} | met |
      | {{precondition2}} | met |
    When {{actionName}} is attempted
    Then the action succeeds
    And the expected outcome is achieved

  Scenario: {{actionName}} fails when {{precondition1}} is not met
    Given {{precondition1}} is not satisfied
    When {{actionName}} is attempted
    Then the action is rejected
    And an error explains "{{precondition1}} must be satisfied before {{actionName}}"
    And no partial changes are made

  Scenario: {{actionName}} fails when {{precondition2}} is not met
    Given {{precondition2}} is not satisfied
    When {{actionName}} is attempted
    Then the action is rejected
    And an error explains "{{precondition2}} must be satisfied before {{actionName}}"

  Scenario: All precondition failures are reported together
    Given multiple preconditions are not satisfied
    When {{actionName}} is attempted
    Then all failing preconditions are listed
    And the user can address all issues at once`,
    parametersSchema: {
      type: 'object',
      properties: {
        actionName: {
          type: 'string',
          description:
            'The action requiring preconditions (e.g., "submit order", "publish article")',
        },
        precondition1: {
          type: 'string',
          description: 'First precondition that must be met',
        },
        precondition2: {
          type: 'string',
          description: 'Second precondition that must be met',
        },
      },
      required: ['actionName', 'precondition1', 'precondition2'],
    },
    exampleUsage: `// Using the template with actionName = "submit order"
Feature: Preconditions for submit order

  Scenario: submit order succeeds when preconditions are met
    Given the following preconditions are satisfied:
      | condition | status |
      | payment method selected | met |
      | shipping address provided | met |
    When submit order is attempted
    Then the action succeeds`,
    tags: ['state-transition', 'preconditions', 'validation', 'business-rules'],
  },

  {
    name: 'Postconditions',
    description:
      'Validates that specific conditions must be true after an action completes. ' +
      'Ensures the system reaches a consistent state after operations.',
    category: 'state-transition',
    format: 'gherkin',
    templateContent: `Feature: Postconditions for {{actionName}}

  Scenario: Postconditions are satisfied after {{actionName}}
    Given the system is in a valid state
    When {{actionName}} completes successfully
    Then {{postcondition1}} is true
    And {{postcondition2}} is true
    And the system is in a consistent state

  Scenario: {{actionName}} is rolled back if postconditions fail
    Given the system is in a valid state
    When {{actionName}} completes but postconditions are not satisfied
    Then the action is rolled back
    And the system returns to its previous state
    And an error is logged for investigation

  Scenario: Postconditions are verified atomically
    When {{actionName}} completes
    Then all postconditions are checked together
    And either all postconditions pass or the action fails
    And partial success is not allowed

  Scenario: Postcondition verification is logged
    When {{actionName}} completes
    Then postcondition verification results are logged
    And verification timing is recorded
    And failures trigger alerts`,
    parametersSchema: {
      type: 'object',
      properties: {
        actionName: {
          type: 'string',
          description:
            'The action whose postconditions are checked (e.g., "payment processed", "user registered")',
        },
        postcondition1: {
          type: 'string',
          description: 'First postcondition that must be true',
        },
        postcondition2: {
          type: 'string',
          description: 'Second postcondition that must be true',
        },
      },
      required: ['actionName', 'postcondition1', 'postcondition2'],
    },
    exampleUsage: `// Using the template with actionName = "payment processed"
Feature: Postconditions for payment processed

  Scenario: Postconditions are satisfied after payment processed
    Given the system is in a valid state
    When payment processed completes successfully
    Then order status is updated to paid is true
    And receipt is generated is true`,
    tags: ['state-transition', 'postconditions', 'consistency', 'verification'],
  },

  // ============================================
  // ERROR HANDLING TEMPLATES (3)
  // ============================================

  {
    name: 'Graceful Failure',
    description:
      'Validates that the system handles errors gracefully without crashing. ' +
      'Ensures user-friendly error handling and system stability.',
    category: 'error-handling',
    format: 'gherkin',
    templateContent: `Feature: Graceful Failure for {{operationName}}

  Scenario: {{operationName}} handles {{errorType}} gracefully
    Given {{operationName}} encounters a {{errorType}}
    When the error occurs
    Then the system does not crash
    And a user-friendly error message is displayed
    And the error is logged with full context
    And the user can retry the operation

  Scenario: {{operationName}} preserves data on failure
    Given user has unsaved work
    When {{operationName}} fails
    Then unsaved data is not lost
    And recovery options are provided
    And auto-save has preserved recent changes

  Scenario: {{operationName}} failure does not affect other users
    Given multiple users are active
    When one user's {{operationName}} fails
    Then other users are not affected
    And the failed user's session remains active
    And shared resources remain accessible

  Scenario: {{operationName}} provides meaningful error context
    When {{errorType}} occurs during {{operationName}}
    Then the error message explains what went wrong
    And suggested remediation steps are provided
    And support contact information is included if needed`,
    parametersSchema: {
      type: 'object',
      properties: {
        operationName: {
          type: 'string',
          description: 'The operation that may fail (e.g., "file upload", "payment processing")',
        },
        errorType: {
          type: 'string',
          description: 'Type of error being handled (e.g., "network timeout", "validation error")',
        },
      },
      required: ['operationName', 'errorType'],
    },
    exampleUsage: `// Using the template with operationName = "file upload", errorType = "network timeout"
Feature: Graceful Failure for file upload

  Scenario: file upload handles network timeout gracefully
    Given file upload encounters a network timeout
    When the error occurs
    Then the system does not crash`,
    tags: ['error-handling', 'resilience', 'user-experience', 'stability'],
  },

  {
    name: 'HTTP Status Codes',
    description:
      'Validates that API responses use appropriate HTTP status codes. ' +
      'Ensures consistent and standards-compliant API behavior.',
    category: 'error-handling',
    format: 'gherkin',
    templateContent: `Feature: HTTP Status Codes for {{apiEndpoint}}

  Scenario: {{apiEndpoint}} returns {{successCode}} on success
    Given a valid request to {{apiEndpoint}}
    When the request is processed successfully
    Then the response status is {{successCode}}
    And the response body contains the expected data

  Scenario: {{apiEndpoint}} returns 400 for invalid request
    Given an invalid request to {{apiEndpoint}}
    When the request is processed
    Then the response status is 400 Bad Request
    And the response body explains the validation errors

  Scenario: {{apiEndpoint}} returns 401 for unauthenticated request
    Given an unauthenticated request to {{apiEndpoint}}
    When the request is processed
    Then the response status is 401 Unauthorized
    And the response includes authentication requirements

  Scenario: {{apiEndpoint}} returns 403 for unauthorized request
    Given an authenticated but unauthorized request to {{apiEndpoint}}
    When the request is processed
    Then the response status is 403 Forbidden
    And the response explains the permission requirement

  Scenario: {{apiEndpoint}} returns 404 for missing resource
    Given a request for a non-existent resource at {{apiEndpoint}}
    When the request is processed
    Then the response status is 404 Not Found
    And the response indicates the resource was not found

  Scenario: {{apiEndpoint}} returns 500 for server errors
    Given an internal error occurs during {{apiEndpoint}} processing
    When the request is processed
    Then the response status is 500 Internal Server Error
    And sensitive error details are not exposed
    And a correlation ID is provided for support`,
    parametersSchema: {
      type: 'object',
      properties: {
        apiEndpoint: {
          type: 'string',
          description: 'The API endpoint (e.g., "POST /api/users", "GET /api/orders/:id")',
        },
        successCode: {
          type: 'number',
          description: 'Expected success status code',
          enum: [200, 201, 202, 204],
          default: 200,
        },
      },
      required: ['apiEndpoint'],
    },
    exampleUsage: `// Using the template with apiEndpoint = "POST /api/users", successCode = 201
Feature: HTTP Status Codes for POST /api/users

  Scenario: POST /api/users returns 201 on success
    Given a valid request to POST /api/users
    When the request is processed successfully
    Then the response status is 201`,
    tags: ['error-handling', 'api', 'http', 'status-codes', 'rest'],
  },

  {
    name: 'Error Messages',
    description:
      'Validates that error messages are informative and actionable. ' +
      'Ensures users understand what went wrong and how to fix it.',
    category: 'error-handling',
    format: 'gherkin',
    templateContent: `Feature: Error Messages for {{featureName}}

  Scenario: Error message clearly identifies the problem
    Given an error occurs in {{featureName}}
    When the error is displayed to the user
    Then the message clearly states what went wrong
    And technical jargon is avoided
    And the message is in the user's language

  Scenario: Error message provides actionable guidance
    Given an error occurs in {{featureName}}
    When the error is displayed
    Then the message suggests how to resolve the issue
    And specific steps are provided when possible
    And alternative actions are offered

  Scenario: Error message does not expose sensitive information
    Given an error occurs involving {{sensitiveData}}
    When the error is displayed
    Then {{sensitiveData}} is not included in the message
    And internal system details are hidden
    And stack traces are not shown to users

  Scenario: Error message includes support options
    Given an error that cannot be self-resolved
    When the error is displayed
    Then contact information for support is provided
    And a reference ID is included for tracking
    And the error is logged for support investigation

  Scenario: Error messages are consistent across the application
    When errors occur in different parts of {{featureName}}
    Then error message format is consistent
    And similar errors use similar wording
    And error categorization is uniform`,
    parametersSchema: {
      type: 'object',
      properties: {
        featureName: {
          type: 'string',
          description: 'The feature or module (e.g., "user registration", "checkout process")',
        },
        sensitiveData: {
          type: 'string',
          description:
            'Type of sensitive data to protect (e.g., "passwords", "credit card numbers")',
          default: 'sensitive information',
        },
      },
      required: ['featureName'],
    },
    exampleUsage: `// Using the template with featureName = "checkout process"
Feature: Error Messages for checkout process

  Scenario: Error message clearly identifies the problem
    Given an error occurs in checkout process
    When the error is displayed to the user
    Then the message clearly states what went wrong`,
    tags: ['error-handling', 'user-experience', 'messages', 'localization', 'support'],
  },
];

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: TemplateCategory): BuiltinTemplateDefinition[] {
  return BUILTIN_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Get template count by category
 */
export function getTemplateCounts(): Record<TemplateCategory, number> {
  const counts: Partial<Record<TemplateCategory, number>> = {};
  for (const template of BUILTIN_TEMPLATES) {
    counts[template.category] = (counts[template.category] || 0) + 1;
  }
  return counts as Record<TemplateCategory, number>;
}

/**
 * Find template by name (case-insensitive)
 */
export function findTemplateByName(name: string): BuiltinTemplateDefinition | undefined {
  const lowerName = name.toLowerCase();
  return BUILTIN_TEMPLATES.find((t) => t.name.toLowerCase() === lowerName);
}
