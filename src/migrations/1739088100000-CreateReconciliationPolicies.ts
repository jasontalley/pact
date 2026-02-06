import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 18: Create reconciliation policies table
 *
 * Controls agent behavior and CI enforcement:
 * - Agent atom suggestions
 * - CI blocking on proposed atoms
 * - Reconciliation inference for orphan tests
 * - Auto-commit settings (not recommended)
 * - Confidence thresholds
 */
export class CreateReconciliationPolicies1739088100000 implements MigrationInterface {
  name = 'CreateReconciliationPolicies1739088100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create reconciliation_policies table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reconciliation_policies" (
        "id" SERIAL PRIMARY KEY,
        "projectId" UUID UNIQUE NOT NULL,
        "allowAgentAtomSuggestions" BOOLEAN DEFAULT true,
        "ciBlockOnProposedAtoms" BOOLEAN DEFAULT true,
        "ciWarnOnProposedAtoms" BOOLEAN DEFAULT false,
        "ciFailOnOrphanTests" BOOLEAN DEFAULT true,
        "reconciliationInfersAtoms" BOOLEAN DEFAULT true,
        "requireHumanApproval" BOOLEAN DEFAULT true,
        "allowAutoCommit" BOOLEAN DEFAULT false,
        "minConfidenceForSuggestion" FLOAT DEFAULT 0.75,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "chk_minConfidence_range" CHECK (
          "minConfidenceForSuggestion" >= 0.0 AND "minConfidenceForSuggestion" <= 1.0
        )
      )
    `);

    // Create index on projectId for fast lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_reconciliation_policies_project"
      ON "reconciliation_policies" ("projectId")
    `);

    // Insert default policy for all existing projects
    await queryRunner.query(`
      INSERT INTO "reconciliation_policies" (
        "projectId",
        "allowAgentAtomSuggestions",
        "ciBlockOnProposedAtoms",
        "ciWarnOnProposedAtoms",
        "ciFailOnOrphanTests",
        "reconciliationInfersAtoms",
        "requireHumanApproval",
        "allowAutoCommit",
        "minConfidenceForSuggestion"
      )
      SELECT
        p.id,
        true,
        true,
        false,
        true,
        true,
        true,
        false,
        0.75
      FROM projects p
      WHERE NOT EXISTS (
        SELECT 1 FROM "reconciliation_policies" rp
        WHERE rp."projectId" = p.id
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reconciliation_policies_project"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reconciliation_policies"`);
  }
}
