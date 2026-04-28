import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text' })
  wb_token!: string;

  @Column({ type: 'varchar', length: 10, default: 'RUB' })
  currency!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  balance_alert_threshold!: string | null;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  last_sync_at!: Date | null;

  /** Do not start report sync before this time (set from WB `X-Ratelimit-Retry`, seconds + buffer). */
  @Column({ type: 'timestamp', nullable: true })
  report_sync_not_before!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_balance_sync_at!: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at' })
  deleted_at!: Date | null;
}
