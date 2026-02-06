import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 16A: Create drift_debt table
 *
 * Drift debt tracks gaps between Pact Main (committed intent) and implementation reality.
 * Only CI-attested reconciliation runs create or update drift records.
 */
export class CreateDriftDebt1738569600000 implements MigrationInterface {
  name = 'CreateDriftDebt1738569600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create drift_debt table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "drift_debt" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "driftType" VARCHAR(30) NOT NULL,
        "description" TEXT NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'open',
        "severity" VARCHAR(10) NOT NULL DEFAULT 'medium',
        "filePath" TEXT,
        "testName" TEXT,
        "atomId" UUID,
        "atomDisplayId" VARCHAR(50),
        "detectedByRunId" UUID NOT NULL,
        "lastConfirmedByRunId" UUID NOT NULL,
        "resolvedByRunId" UUID,
        "projectId" UUID,
        "detectedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastConfirmedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "resolvedAt" TIMESTAMP,
        "dueAt" TIMESTAMP,
        "exceptionLane" VARCHAR(30),
        "exceptionJustification" TEXT,
        "ageDays" INT NOT NULL DEFAULT 0,
        "confirmationCount" INT NOT NULL DEFAULT 1,
        "metadata" JSONB
      )
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_drift_debt_detectedByRunId'
        ) THEN
          ALTER TABLE "drift_debt"
          ADD CONSTRAINT "FK_drift_debt_detectedByRunId"
          FOREIGN KEY ("detectedByRunId") REFERENCES "reconciliation_runs"("id")
          ON DELETE CASCADE;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_drift_debt_lastConfirmedByRunId'
        ) THEN
          ALTER TABLE "drift_debt"
          ADD CONSTRAINT "FK_drift_debt_lastConfirmedByRunId"
          FOREIGN KEY ("lastConfirmedByRunId") REFERENCES "reconciliation_runs"("id")
          ON DELETE CASCADE;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_drift_debt_resolvedByRunId'
        ) THEN
          ALTER TABLE "drift_debt"
          ADD CONSTRAINT "FK_drift_debt_resolvedByRunId"
          FOREIGN KEY ("resolvedByRunId") REFERENCES "reconciliation_runs"("id")
          ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_drift_debt_projectId'
        ) THEN
          ALTER TABLE "drift_debt"
          ADD CONSTRAINT "FK_drift_debt_projectId"
          FOREIGN KEY ("projectId") REFERENCES "projects"("id")
          ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_drift_debt_atomId'
        ) THEN
          ALTER TABLE "drift_debt"
          ADD CONSTRAINT "FK_drift_debt_atomId"
          FOREIGN KEY ("atomId") REFERENCES "atoms"("id")
          ON DELETE SET NULL;
        END IF;
      END $$
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_drift_debt_project_status"
      ON "drift_debt" ("projectId", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_drift_debt_type_status"
      ON "drift_debt" ("driftType", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_drift_debt_due"
      ON "drift_debt" ("dueAt")
      WHERE "dueAt" IS NOT NULL
    `);

    // Composite index for deduplication queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_drift_debt_dedup"
      ON "drift_debt" ("filePath", "testName", "driftType")
      WHERE "status" = 'open'
    `);

    // Index for commitment backlog (atoms without tests)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_drift_debt_atom"
      ON "drift_debt" ("atomId", "driftType")
      WHERE "atomId" IS NOT NULL
    `);

    // Index for aging queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_drift_debt_age"
      ON "drift_debt" ("ageDays", "status")
      WHERE "status" = 'open'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_drift_debt_age"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_drift_debt_atom"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_drift_debt_dedup"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_drift_debt_due"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_drift_debt_type_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_drift_debt_project_status"`);
    await queryRunner.query(`ALTER TABLE "drift_debt" DROP CONSTRAINT IF EXISTS "FK_drift_debt_atomId"`);
    await queryRunner.query(`ALTER TABLE "drift_debt" DROP CONSTRAINT IF EXISTS "FK_drift_debt_projectId"`);
    await queryRunner.query(`ALTER TABLE "drift_debt" DROP CONSTRAINT IF EXISTS "FK_drift_debt_resolvedByRunId"`);
    await queryRunner.query(`ALTER TABLE "drift_debt" DROP CONSTRAINT IF EXISTS "FK_drift_debt_lastConfirmedByRunId"`);
    await queryRunner.query(`ALTER TABLE "drift_debt" DROP CONSTRAINT IF EXISTS "FK_drift_debt_detectedByRunId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "drift_debt"`);
  }
}
