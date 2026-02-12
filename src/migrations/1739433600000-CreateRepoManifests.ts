import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the repo_manifests table for storing deterministic repository
 * analysis snapshots. Manifests capture structure, evidence inventory,
 * domain model, health signals, and domain concepts — all without LLM calls.
 *
 * Also stores raw state snapshots used by the load_manifest graph node
 * to hydrate reconciliation graph state for the LLM inference phase.
 */
export class CreateRepoManifests1739433600000 implements MigrationInterface {
  name = 'CreateRepoManifests1739433600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "repo_manifests" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "projectId" UUID REFERENCES "projects"("id") ON DELETE SET NULL,
        "commitHash" VARCHAR(64),
        "status" VARCHAR(20) NOT NULL DEFAULT 'generating'
          CHECK ("status" IN ('generating', 'complete', 'failed')),

        -- Manifest sections (human-readable summaries)
        "identity" JSONB NOT NULL DEFAULT '{}',
        "structure" JSONB NOT NULL DEFAULT '{}',
        "evidenceInventory" JSONB NOT NULL DEFAULT '{}',
        "domainModel" JSONB NOT NULL DEFAULT '{}',
        "healthSignals" JSONB NOT NULL DEFAULT '{}',
        "domainConcepts" JSONB NOT NULL DEFAULT '{}',

        -- Raw state snapshots (for graph state hydration)
        "repoStructureSnapshot" JSONB,
        "orphanTestsSnapshot" JSONB,
        "evidenceItemsSnapshot" JSONB,
        "testQualitySnapshot" JSONB,
        "coverageDataSnapshot" JSONB,
        "contextSnapshot" JSONB,

        -- Metadata
        "rootDirectory" TEXT NOT NULL,
        "contentSource" VARCHAR(20) NOT NULL DEFAULT 'filesystem'
          CHECK ("contentSource" IN ('filesystem', 'github', 'pre_read')),
        "generationDurationMs" INTEGER,
        "errorMessage" TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Index for dedup: same project + same commit → reuse manifest
    await queryRunner.query(`
      CREATE INDEX "idx_repo_manifests_project_commit"
        ON "repo_manifests" ("projectId", "commitHash")
    `);

    // Index for fetching latest manifest per project
    await queryRunner.query(`
      CREATE INDEX "idx_repo_manifests_project_latest"
        ON "repo_manifests" ("projectId", "createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_repo_manifests_project_latest"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_repo_manifests_project_commit"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "repo_manifests"`);
  }
}
