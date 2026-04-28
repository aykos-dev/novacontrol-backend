import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Client } from '../clients/client.entity.js';

@Entity('wb_balances')
@Index(['client_id', 'snapshot_at'])
export class WbBalance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  client_id!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  current!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  for_withdraw!: string;

  @Column({ type: 'varchar', length: 10 })
  currency!: string;

  @Column({ type: 'jsonb', nullable: true })
  raw_data!: Record<string, any> | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  snapshot_at!: Date;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client!: Client;
}
