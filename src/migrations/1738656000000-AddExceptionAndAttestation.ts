import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 16B: Add exception lanes and CI attestation to reconciliation runs
 *
 * Exception lanes control drift convergence deadlines:
 * - normal: 14 days (default)
 * - hotfix-exception: 3 days
 * - spike-exception: 7 days
 *
 * Attestation type determines whether drift debt is created:
 * - local: Advisory only, no drift records created
 * - ci-attested: Canonical, creates/updates drift records
 */
export class AddExceptionAndAttestation1738656000000 implements MigrationInterface {
  name = 'AddExceptionAndAttestation1738656000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add exceptionLane column
    await queryRunner.query(`
      ALTER TABLE "reconciliation_runs"
      ADD COLUMN IF NOT EXISTS "exceptionLane" VARCHAR(30) DEFAULT 'normal'
    `);

    // Add attestationType column
    await queryRunner.query(`
      ALTER TABLE "reconciliation_runs"
      ADD COLUMN IF NOT EXISTS "attestationType" VARCHAR(20) DEFAULT 'local'
    `);

    // Add exceptionJustification column (required for hotfix/spike)
    await queryRunner.query(`
      ALTER TABLE "reconciliation_runs"
      ADD COLUMN IF NOT EXISTS "exceptionJustification" TEXT
    `);

    // Index for finding CI-attested runs
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_reconciliation_runs_attestation"
      ON "reconciliation_runs" ("attestationType")
      WHERE "attestationType" = 'ci-attested'
    `);

    // Index for exception lane queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_reconciliation_runs_exception_lane"
      ON "reconciliation_runs" ("exceptionLane")
      WHERE "exceptionLane" != 'normal'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reconciliation_runs_exception_lane"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reconciliation_runs_attestation"`);
    await queryRunner.query(`
      ALTER TABLE "reconciliation_runs" DROP COLUMN IF EXISTS "exceptionJustification"
    `);
    await queryRunner.query(`
      ALTER TABLE "reconciliation_runs" DROP COLUMN IF EXISTS "attestationType"
    `);
    await queryRunner.query(`
      ALTER TABLE "reconciliation_runs" DROP COLUMN IF EXISTS "exceptionLane"
    `);
  }
}
