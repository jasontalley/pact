# @atom IA-BDD-001, IA-BDD-002, IA-BDD-003, IA-BDD-004, IA-BDD-005
Feature: Intent Atom Creation
  As a product owner
  I want to create Intent Atoms from natural language descriptions
  So that I can capture behavioral requirements in a testable form

  Background:
    Given the Pact system is initialized
    And I am authenticated as a product owner

  # Scenario 1: User creates an Intent Atom with natural language
  @atom-creation @happy-path
  Scenario: User creates an Intent Atom with natural language
    Given I have an intent description: "User authentication must complete within 2 seconds under normal load"
    When I submit the intent for atomization
    Then the Atomization Agent analyzes the intent
    And the atom is created with status "draft"
    And the atom ID matches pattern "IA-\d{3}"
    And the confidence score is at least 0.7

  # Scenario 2: System validates atomicity of intent
  @atomicity-validation
  Scenario: System validates atomicity of intent
    Given I have a compound intent: "User can log in and view dashboard and update settings"
    When I submit the intent for atomization
    Then the Atomization Agent detects the intent is not atomic
    And the system suggests decomposition into smaller atoms
    And no atom is created
    And the confidence score reflects low atomicity

  # Scenario 3: User iteratively refines non-atomic intent
  @refinement
  Scenario: User iteratively refines non-atomic intent
    Given I have a vague intent: "System should be fast"
    When I submit the intent for atomization
    Then the Atomization Agent analyzes the intent
    And the confidence score is below 0.7
    And I receive feedback explaining the issue
    When I refine the intent to: "API response time must be under 200ms for 95th percentile"
    And I submit the intent for atomization
    Then the confidence score is at least 0.7
    And the atom is created with status "draft"

  # Scenario 4: User commits a quality-validated atom
  @commitment @quality-gate
  Scenario: User commits a quality-validated atom
    Given I have an intent description: "Session timeout must occur after 30 minutes of inactivity"
    When I submit the intent for atomization
    And the atom is created with status "draft"
    And I set the atom quality score to 85
    When I commit the atom
    Then the atom status changes to "committed"
    And the commit timestamp is recorded

  # Scenario 5: System blocks commitment of low-quality atom
  @commitment @quality-gate @negative
  Scenario: System blocks commitment of low-quality atom
    Given I have an intent description: "Notifications should be sent"
    When I submit the intent for atomization
    And the atom is created with status "draft"
    And I set the atom quality score to 70
    When I attempt to commit the atom
    Then the commit is rejected
    And I receive a message about quality requirements
    And the atom remains in "draft" status

  # Additional scenarios from original file

  @validation @category
  Scenario: Create atom with specific category
    Given I have an intent description: "Payment transaction must be encrypted using TLS 1.3"
    And I specify category as "security"
    When I submit the intent for atomization
    Then the atom is created with category "security"

  @validation @implementation-agnostic
  Scenario: Reject implementation-specific intent
    Given I have an implementation-specific intent: "Use Redis for session storage"
    When I submit the intent for atomization
    Then the Atomization Agent detects implementation details
    And the confidence score is below 0.7
    And I receive feedback about implementation-agnostic requirements
