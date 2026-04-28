import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AdminUser } from '../users/admin-user.entity.js';

@Entity('expense_categories')
@Index('uq_expense_categories_slug_not_deleted', ['slug'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class ExpenseCategory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Stable key (e.g. fulfillment); immutable after create. */
  @Column({ type: 'varchar', length: 64 })
  slug!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** Chart / UI color, e.g. #3b82f6 */
  @Column({ type: 'varchar', length: 7, nullable: true })
  color!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  icon_emoji!: string | null;

  @Column({ type: 'int', default: 0 })
  sort_order!: number;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'uuid', nullable: true })
  created_by!: string | null;

  @ManyToOne(() => AdminUser, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator!: AdminUser | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at' })
  deleted_at!: Date | null;
}
