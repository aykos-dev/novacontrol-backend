import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Client } from '../clients/client.entity.js';

export enum SyncStatus {
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  RATE_LIMITED = 'rate_limited',
}

@Entity('sync_logs')
export class SyncLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  client_id!: string;

  @Column({ type: 'enum', enum: SyncStatus })
  status!: SyncStatus;

  @Column({ type: 'int', nullable: true })
  rows_fetched!: number | null;

  @Column({ type: 'text', nullable: true })
  error_message!: string | null;

  @Column({ type: 'timestamp' })
  started_at!: Date;

  @Column({ type: 'timestamp', nullable: true })
  finished_at!: Date | null;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client!: Client;
}
