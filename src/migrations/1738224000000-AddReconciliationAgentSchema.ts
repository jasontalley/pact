import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Reconciliation Agent Schema
 *
 * This migration creates the persistence schema for the Reconciliation Agent:
 * 1. reconciliation_runs - Tracks each execution of the reconciliation agent
 * 2. atom_recommendations - Stores inferred atoms as recommendations
 * 3. molecule_recommendations - Stores inferred molecules as recommendations
 * 4. test_records - Tracks tests analyzed during reconciliation
 *
 * Key Design Decisions:
 * - atom_recommendations uses RESTRICT on atomId FK (atoms should be superseded, not deleted)
 * - test_records has composite index on (filePath, testName) for INV-R002 lookups
 * - All recommendations track status for human-in-the-loop review
 *
 * @see docs/implementation-checklist-phase5.md Section 3.5
 */
export class AddReconciliationAgentSchema1738224000000 implements MigrationInterface {
  name = 'AddReconciliationAgentSchema1738224000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========================================
    // Part 0: Clean up any partial state
    // ========================================

    await queryRunner.query(`DROP TABLE IF EXISTS "test_records" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "molecule_recommendations" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "atom_recommendations" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reconciliation_runs" CASCADE`);

    // ========================================
    // Part 1: Create reconciliation_runs table
    // ========================================

    await queryRunner.query(`
      CREATE TABLE "reconciliation_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "runId" varchar(20) NOT NULL,
        "rootDirectory" text NOT NULL,
        "reconciliationMode" varchar(20) NOT NULL,
        "deltaBaselineRunId" uuid,
        "deltaBaselineCommitHash" varchar(64),
        "currentCommitHash" varchar(64),
        "status" varchar(20) NOT NULL DEFAULT 'running',
        "options" jsonb NOT NULL DEFAULT '{}',
        "summary" jsonb,
        "patchOps" jsonb NOT NULL DEFAULT '[]',
        "projectId" uuid,
        "errorMessage" text,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "completedAt" timestamp,
        CONSTRAINT "PK_reconciliation_runs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_reconciliation_runs_runId" UNIQUE ("runId")
      )
    `);

    // Self-referential FK for delta baseline
    await queryRunner.query(`
      ALTER TABLE "reconciliation_runs"
      ADD CONSTRAINT "FK_reconciliation_runs_deltaBaselineRunId"
      FOREIGN KEY ("deltaBaselineRunId")
      REFERENCES "reconciliation_runs"("id")
      ON DELETE SET NULL
    `);

    // FK to projects (if table exists)
    const projectTableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'projects'
      )
    `);

    if (projectTableExists[0]?.exists) {
      await queryRunner.query(`
        ALTER TABLE "reconciliation_runs"
        ADD CONSTRAINT "FK_reconciliation_runs_projectId"
        FOREIGN KEY ("projectId")
        REFERENCES "projects"("id")
        ON DELETE SET NULL
      `);
    }

    // Check constraint for reconciliation mode
    await queryRunner.query(`
      ALTER TABLE "reconciliation_runs"
      ADD CONSTRAINT "CHK_reconciliation_runs_mode"
      CHECK ("reconciliationMode" IN ('full-scan', 'delta'))
    `);

    // Check constraint for status
    await queryRunner.query(`
      ALTER TABLE "reconciliation_runs"
      ADD CONSTRAINT "CHK_reconciliation_runs_status"
      CHECK ("status" IN ('running', 'completed', 'failed', 'pending_review'))
    `);

    // ========================================
    // Part 2: Create atom_recommendations table
    // ========================================

    await queryRunner.query(`
      CREATE TABLE "atom_recommendations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "runId" uuid NOT NULL,
        "tempId" varchar(100) NOT NULL,
        "description" text NOT NULL,
        "category" varchar(50) NOT NULL,
        "confidence" decimal(5,2) NOT NULL,
        "reasoning" text NOT NULL,
        "sourceTestFilePath" text NOT NULL,
        "sourceTestName" text NOT NULL,
        "sourceTestLineNumber" integer NOT NULL,
        "observableOutcomes" jsonb NOT NULL DEFAULT '[]',
        "relatedDocs" jsonb NOT NULL DEFAULT '[]',
        "ambiguityReasons" jsonb,
        "qualityScore" decimal(5,2),
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "rejectionReason" text,
        "atomId" uuid,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "acceptedAt" timestamp,
        "rejectedAt" timestamp,
        CONSTRAINT "PK_atom_recommendations" PRIMARY KEY ("id")
      )
    `);

    // FK to reconciliation_runs
    await queryRunner.query(`
      ALTER TABLE "atom_recommendations"
      ADD CONSTRAINT "FK_atom_recommendations_runId"
      FOREIGN KEY ("runId")
      REFERENCES "reconciliation_runs"("id")
      ON DELETE CASCADE
    `);

    // FK to atoms (RESTRICT - atoms should be superseded, not deleted)
    await queryRunner.query(`
      ALTER TABLE "atom_recommendations"
      ADD CONSTRAINT "FK_atom_recommendations_atomId"
      FOREIGN KEY ("atomId")
      REFERENCES "atoms"("id")
      ON DELETE RESTRICT
    `);

    // Check constraint for status
    await queryRunner.query(`
      ALTER TABLE "atom_recommendations"
      ADD CONSTRAINT "CHK_atom_recommendations_status"
      CHECK ("status" IN ('pending', 'accepted', 'rejected'))
    `);

    // ========================================
    // Part 3: Create molecule_recommendations table
    // ========================================

    await queryRunner.query(`
      CREATE TABLE "molecule_recommendations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "runId" uuid NOT NULL,
        "tempId" varchar(100) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "atomRecommendationTempIds" jsonb NOT NULL DEFAULT '[]',
        "atomRecommendationIds" jsonb NOT NULL DEFAULT '[]',
        "atomIds" jsonb,
        "confidence" decimal(5,2) NOT NULL,
        "reasoning" text NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "rejectionReason" text,
        "moleculeId" uuid,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "acceptedAt" timestamp,
        "rejectedAt" timestamp,
        CONSTRAINT "PK_molecule_recommendations" PRIMARY KEY ("id")
      )
    `);

    // FK to reconciliation_runs
    await queryRunner.query(`
      ALTER TABLE "molecule_recommendations"
      ADD CONSTRAINT "FK_molecule_recommendations_runId"
      FOREIGN KEY ("runId")
      REFERENCES "reconciliation_runs"("id")
      ON DELETE CASCADE
    `);

    // FK to molecules (if table exists)
    const moleculesTableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'molecules'
      )
    `);

    if (moleculesTableExists[0]?.exists) {
      await queryRunner.query(`
        ALTER TABLE "molecule_recommendations"
        ADD CONSTRAINT "FK_molecule_recommendations_moleculeId"
        FOREIGN KEY ("moleculeId")
        REFERENCES "molecules"("id")
        ON DELETE SET NULL
      `);
    }

    // Check constraint for status
    await queryRunner.query(`
      ALTER TABLE "molecule_recommendations"
      ADD CONSTRAINT "CHK_molecule_recommendations_status"
      CHECK ("status" IN ('pending', 'accepted', 'rejected'))
    `);

    // ========================================
    // Part 4: Create test_records table
    // ========================================

    await queryRunner.query(`
      CREATE TABLE "test_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "runId" uuid NOT NULL,
        "filePath" text NOT NULL,
        "testName" text NOT NULL,
        "lineNumber" integer NOT NULL,
        "testCodeHash" varchar(64),
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "atomRecommendationId" uuid,
        "rejectionReason" text,
        "hadAtomAnnotation" boolean NOT NULL DEFAULT false,
        "linkedAtomId" varchar(100),
        "isDeltaChange" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "resolvedAt" timestamp,
        CONSTRAINT "PK_test_records" PRIMARY KEY ("id")
      )
    `);

    // FK to reconciliation_runs
    await queryRunner.query(`
      ALTER TABLE "test_records"
      ADD CONSTRAINT "FK_test_records_runId"
      FOREIGN KEY ("runId")
      REFERENCES "reconciliation_runs"("id")
      ON DELETE CASCADE
    `);

    // FK to atom_recommendations
    await queryRunner.query(`
      ALTER TABLE "test_records"
      ADD CONSTRAINT "FK_test_records_atomRecommendationId"
      FOREIGN KEY ("atomRecommendationId")
      REFERENCES "atom_recommendations"("id")
      ON DELETE SET NULL
    `);

    // Check constraint for status
    await queryRunner.query(`
      ALTER TABLE "test_records"
      ADD CONSTRAINT "CHK_test_records_status"
      CHECK ("status" IN ('pending', 'accepted', 'rejected', 'skipped'))
    `);

    // ========================================
    // Part 5: Create indexes
    // ========================================

    // reconciliation_runs indexes
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_reconciliation_runs_runId"
      ON "reconciliation_runs" ("runId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reconciliation_runs_status"
      ON "reconciliation_runs" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reconciliation_runs_projectId"
      ON "reconciliation_runs" ("projectId")
      WHERE "projectId" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reconciliation_runs_createdAt"
      ON "reconciliation_runs" ("createdAt" DESC)
    `);

    // atom_recommendations indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_atom_recommendations_runId"
      ON "atom_recommendations" ("runId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_atom_recommendations_status"
      ON "atom_recommendations" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_atom_recommendations_tempId"
      ON "atom_recommendations" ("runId", "tempId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_atom_recommendations_sourceTest"
      ON "atom_recommendations" ("sourceTestFilePath", "sourceTestName")
    `);

    // molecule_recommendations indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_molecule_recommendations_runId"
      ON "molecule_recommendations" ("runId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_molecule_recommendations_status"
      ON "molecule_recommendations" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_molecule_recommendations_tempId"
      ON "molecule_recommendations" ("runId", "tempId")
    `);

    // test_records indexes (CRITICAL for INV-R002)
    await queryRunner.query(`
      CREATE INDEX "IDX_test_records_runId"
      ON "test_records" ("runId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_test_records_filePath_testName"
      ON "test_records" ("filePath", "testName")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_test_records_status"
      ON "test_records" ("status")
    `);

    // Index for finding closed tests (INV-R002: Delta Closure Stopping Rule)
    await queryRunner.query(`
      CREATE INDEX "IDX_test_records_closed"
      ON "test_records" ("filePath", "testName", "status")
      WHERE "status" IN ('accepted', 'rejected')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_test_records_closed"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_test_records_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_test_records_filePath_testName"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_test_records_runId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_molecule_recommendations_tempId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_molecule_recommendations_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_molecule_recommendations_runId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_atom_recommendations_sourceTest"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_atom_recommendations_tempId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_atom_recommendations_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_atom_recommendations_runId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reconciliation_runs_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reconciliation_runs_projectId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reconciliation_runs_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reconciliation_runs_runId"`);

    // Drop check constraints
    await queryRunner.query(`
      ALTER TABLE "test_records"
      DROP CONSTRAINT IF EXISTS "CHK_test_records_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "molecule_recommendations"
      DROP CONSTRAINT IF EXISTS "CHK_molecule_recommendations_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "atom_recommendations"
      DROP CONSTRAINT IF EXISTS "CHK_atom_recommendations_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "reconciliation_runs"
      DROP CONSTRAINT IF EXISTS "CHK_reconciliation_runs_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "reconciliation_runs"
      DROP CONSTRAINT IF EXISTS "CHK_reconciliation_runs_mode"
    `);

    // Drop foreign keys
    await queryRunner.query(`
      ALTER TABLE "test_records"
      DROP CONSTRAINT IF EXISTS "FK_test_records_atomRecommendationId"
    `);

    await queryRunner.query(`
      ALTER TABLE "test_records"
      DROP CONSTRAINT IF EXISTS "FK_test_records_runId"
    `);

    await queryRunner.query(`
      ALTER TABLE "molecule_recommendations"
      DROP CONSTRAINT IF EXISTS "FK_molecule_recommendations_moleculeId"
    `);

    await queryRunner.query(`
      ALTER TABLE "molecule_recommendations"
      DROP CONSTRAINT IF EXISTS "FK_molecule_recommendations_runId"
    `);

    await queryRunner.query(`
      ALTER TABLE "atom_recommendations"
      DROP CONSTRAINT IF EXISTS "FK_atom_recommendations_atomId"
    `);

    await queryRunner.query(`
      ALTER TABLE "atom_recommendations"
      DROP CONSTRAINT IF EXISTS "FK_atom_recommendations_runId"
    `);

    await queryRunner.query(`
      ALTER TABLE "reconciliation_runs"
      DROP CONSTRAINT IF EXISTS "FK_reconciliation_runs_projectId"
    `);

    await queryRunner.query(`
      ALTER TABLE "reconciliation_runs"
      DROP CONSTRAINT IF EXISTS "FK_reconciliation_runs_deltaBaselineRunId"
    `);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "test_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "molecule_recommendations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "atom_recommendations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reconciliation_runs"`);
  }
}
