import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAllowedSectionsToAdminUsers1778284800000
  implements MigrationInterface
{
  name = 'AddAllowedSectionsToAdminUsers1778284800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasAllowedSections = await queryRunner.hasColumn(
      'admin_users',
      'allowed_sections',
    );
    if (!hasAllowedSections) {
      await queryRunner.query(
        `ALTER TABLE "admin_users" ADD "allowed_sections" text`,
      );
    }
    await queryRunner.query(
      `UPDATE "admin_users" SET "allowed_sections" = 'dashboard,clients,finance,analytics,expenseCategories,users,settings' WHERE "role" = 'ADMIN'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasAllowedSections = await queryRunner.hasColumn(
      'admin_users',
      'allowed_sections',
    );
    if (hasAllowedSections) {
      await queryRunner.query(
        `ALTER TABLE "admin_users" DROP COLUMN "allowed_sections"`,
      );
    }
  }
}
