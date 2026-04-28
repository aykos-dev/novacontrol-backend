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

@Entity('extra_incomes')
@Index(['client_id', 'income_date'])
export class ExtraIncome {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  client_id!: string;

  @Column({ type: 'uuid' })
  created_by!: string;

  @Column({ type: 'date' })
  income_date!: string;

  /** Amount in USD entered by the user. */
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount!: string;

  /**
   * KGS per 1 USD at entry time. When null, legacy row: treat `amount` as KGS for summaries.
   */
  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  exchange_rate_kgs_per_usd!: string | null;

  /** USD × rate, rounded to 2 dp. Null only for legacy rows. */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  amount_kgs!: string | null;

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
