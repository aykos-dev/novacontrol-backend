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
import { Client } from '../clients/client.entity.js';
import { AdminUser } from '../users/admin-user.entity.js';
import { ExpenseCategory } from './expense-category.entity.js';

@Entity('extra_expenses')
@Index(['client_id', 'expense_date'])
export class ExtraExpense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  client_id!: string;

  @Column({ type: 'uuid' })
  created_by!: string;

  @Column({ type: 'date' })
  expense_date!: string;

  @Column({ type: 'uuid' })
  category_id!: string;

  @ManyToOne(() => ExpenseCategory, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  expenseCategory!: ExpenseCategory;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency!: string;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at' })
  deleted_at!: Date | null;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client!: Client;

  @ManyToOne(() => AdminUser)
  @JoinColumn({ name: 'created_by' })
  creator!: AdminUser;
}
