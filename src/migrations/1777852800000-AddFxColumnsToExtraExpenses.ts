import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFxColumnsToExtraExpenses1777852800000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "extra_expenses"
        ADD COLUMN IF NOT EXISTS "exchange_rate_kgs_per_usd" DECIMAL(18, 6),
        ADD COLUMN IF NOT EXISTS "amount_kgs" DECIMAL(15, 2)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "extra_expenses"
        DROP COLUMN IF EXISTS "amount_kgs",
        DROP COLUMN IF EXISTS "exchange_rate_kgs_per_usd"
    `);
  }
}
