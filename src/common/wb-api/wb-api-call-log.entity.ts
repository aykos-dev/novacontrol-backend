import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type WbApiCallOutcome = 'success' | 'error';

@Entity('wb_api_call_logs')
@Index(['client_id', 'created_at'])
export class WbApiCallLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  client_id!: string | null;

  @Column({ type: 'varchar', length: 8 })
  outcome!: WbApiCallOutcome;

  @Column({ type: 'varchar', length: 10 })
  method!: string;

  @Column({ type: 'text' })
  url!: string;

  @Column({ type: 'int', nullable: true })
  http_status!: number | null;

  @Column({ type: 'int' })
  duration_ms!: number;

  @Column({ type: 'text', nullable: true })
  error_message!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  error_code!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  request_params!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  response_body!: unknown;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
