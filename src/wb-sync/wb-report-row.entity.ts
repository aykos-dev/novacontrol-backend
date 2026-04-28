import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Client } from '../clients/client.entity.js';

@Entity('wb_report_rows')
@Unique(['client_id', 'rrd_id'])
@Index(['client_id', 'rr_dt'])
export class WbReportRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  client_id!: string;

  @Column({ type: 'bigint' })
  rrd_id!: string;

  @Column({ type: 'bigint' })
  realizationreport_id!: string;

  @Column({ type: 'date' })
  rr_dt!: string;

  @Column({ type: 'varchar', length: 100 })
  supplier_oper_name!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  retail_price_withdisc_rub!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  ppvz_for_pay!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  ppvz_reward!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  delivery_rub!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  storage_fee!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  penalty!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  deduction!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  acceptance!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  rebill_logistic_cost!: string;

  @Column({ type: 'bigint' })
  nm_id!: string;

  @Column({ type: 'varchar', length: 255 })
  sa_name!: string;

  @Column({ type: 'jsonb', nullable: true })
  raw_data!: Record<string, any> | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  fetched_at!: Date;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client!: Client;
}
