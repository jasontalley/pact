import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create metrics_snapshots table
 *
 * Stores daily snapshots of epistemic and coupling metrics for trend analysis.
 * One snapshot per day (unique constraint on snapshotDate).
 */
export class CreateMetricsSnapshots1738310400000 implements MigrationInterface {
  name = 'CreateMetricsSnapshots1738310400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "metrics_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "snapshotDate" date NOT NULL,
        "epistemicMetrics" jsonb NOT NULL DEFAULT '{}',
        "couplingMetrics" jsonb NOT NULL DEFAULT '{}',
        "additionalMetrics" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_metrics_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_metrics_snapshots_date" UNIQUE ("snapshotDate")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_metrics_snapshots_date" ON "metrics_snapshots" ("snapshotDate")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_metrics_snapshots_date"`);
    await queryRunner.query(`DROP TABLE "metrics_snapshots"`);
  }
}
