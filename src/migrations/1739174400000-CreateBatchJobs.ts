import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 20: Create batch_jobs table
 *
 * Persists batch job metadata for long-running LLM batch operations
 * so we can recover from app restarts and track batch progress.
 *
 * @see docs/implementation-checklist-phase20.md Step D
 */
export class CreateBatchJobs1739174400000 implements MigrationInterface {
  name = 'CreateBatchJobs1739174400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "batch_jobs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "providerBatchId" VARCHAR NOT NULL,
        "provider" VARCHAR NOT NULL,
        "status" VARCHAR NOT NULL DEFAULT 'submitted',
        "totalRequests" INTEGER NOT NULL,
        "completedRequests" INTEGER NOT NULL DEFAULT 0,
        "failedRequests" INTEGER NOT NULL DEFAULT 0,
        "reconciliationRunId" VARCHAR,
        "agentName" VARCHAR,
        "purpose" VARCHAR,
        "metadata" JSONB,
        "submittedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "completedAt" TIMESTAMP
      )
    `);

    // Index on providerBatchId for status lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_batch_jobs_provider_batch_id"
      ON "batch_jobs" ("providerBatchId")
    `);

    // Index on reconciliationRunId for linking batches to recon runs
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_batch_jobs_reconciliation_run_id"
      ON "batch_jobs" ("reconciliationRunId")
    `);

    // Index on status for finding active/pending batches on startup
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_batch_jobs_status"
      ON "batch_jobs" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_batch_jobs_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_batch_jobs_reconciliation_run_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_batch_jobs_provider_batch_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "batch_jobs"`);
  }
}
