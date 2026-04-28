import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

export enum AdminRole {
  ADMIN = 'ADMIN',
  VIEWER = 'VIEWER',
}

@Entity('admin_users')
@Index('uq_admin_users_username_not_deleted', ['username'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('uq_admin_users_telegram_not_deleted', ['telegram_id'], {
  unique: true,
  where: '"deleted_at" IS NULL AND "telegram_id" IS NOT NULL',
})
export class AdminUser {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 50 })
  username!: string;

  @Column({ type: 'varchar', length: 255 })
  password_hash!: string;

  @Column({ type: 'enum', enum: AdminRole, default: AdminRole.VIEWER })
  role!: AdminRole;

  @Column({ type: 'bigint', nullable: true })
  telegram_id!: string | null;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at' })
  deleted_at!: Date | null;
}
