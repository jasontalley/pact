import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add gherkinScenario column to molecule_recommendations and molecules tables.
 * Stores Gherkin (Given/When/Then) descriptions for product manager review.
 */
export class AddGherkinScenarioToMolecules1739347200000
  implements MigrationInterface
{
  name = 'AddGherkinScenarioToMolecules1739347200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "molecule_recommendations" ADD COLUMN "gherkinScenario" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "molecules" ADD COLUMN "gherkinScenario" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "molecules" DROP COLUMN "gherkinScenario"`,
    );
    await queryRunner.query(
      `ALTER TABLE "molecule_recommendations" DROP COLUMN "gherkinScenario"`,
    );
  }
}
