import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 21C: Add evidence source tracking to atom_recommendations.
 *
 * - evidenceSources (JSONB): Array of {type, filePath, name, confidence}
 * - primaryEvidenceType (VARCHAR): e.g. 'test', 'source_export', 'ui_component'
 */
export class AddEvidenceSourcesToAtomRecommendations1739260800000
  implements MigrationInterface
{
  name = 'AddEvidenceSourcesToAtomRecommendations1739260800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "atom_recommendations" ADD COLUMN "evidenceSources" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "atom_recommendations" ADD COLUMN "primaryEvidenceType" varchar(30)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "atom_recommendations" DROP COLUMN "primaryEvidenceType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "atom_recommendations" DROP COLUMN "evidenceSources"`,
    );
  }
}
