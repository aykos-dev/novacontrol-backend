import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Client } from '../clients/client.entity.js';

export enum AlertType {
  LOW_BALANCE = 'low_balance',
  DAILY_REPORT = 'daily_report',
  EXPENSE_CREATED = 'expense_created',
}

@Entity('alert_logs')
export class AlertLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  client_id!: string;

  @Column({ type: 'enum', enum: AlertType })
  alert_type!: AlertType;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'timestamp', default: () => 'now()' })
  sent_at!: Date;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client!: Client;
}
