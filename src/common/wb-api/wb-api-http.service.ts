import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, {
  AxiosInstance,
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { mkdir } from 'fs/promises';
import { appendFile } from 'fs/promises';
import { dirname, join } from 'path';
import {
  WbApiCallLog,
  WbApiCallOutcome,
} from './wb-api-call-log.entity.js';

function maskAuthorization(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (s.length <= 12) return '[REDACTED]';
  return `${s.slice(0, 8)}…${s.slice(-4)} [len=${s.length}]`;
}

function summarizeBody(data: unknown, maxChars: number): unknown {
  if (data == null) return data;
  if (Array.isArray(data)) {
    if (data.length === 0) return { _type: 'array', length: 0 };
    return {
      _type: 'array',
      length: data.length,
      firstItem: data[0],
    };
  }
  if (typeof data === 'object') {
    const json = JSON.stringify(data);
    if (json.length <= maxChars) return data;
    return json.slice(0, maxChars) + '…[truncated]';
  }
  const str = String(data);
  return str.length > maxChars ? str.slice(0, maxChars) + '…' : str;
}

function pickRequestHeaders(
  headers: InternalAxiosRequestConfig['headers'],
): Record<string, string> {
  if (!headers || typeof headers !== 'object') return {};
  const out: Record<string, string> = {};
  const common = ['authorization', 'content-type', 'accept'];
  for (const key of Object.keys(headers as object)) {
    const lower = key.toLowerCase();
    if (!common.includes(lower)) continue;
    const val = (headers as Record<string, unknown>)[key];
    if (lower === 'authorization') {
      out[key] = maskAuthorization(val);
    } else {
      out[key] = String(val ?? '');
    }
  }
  return out;
}

@Injectable()
export class WbApiHttpService implements OnModuleInit {
  private readonly logger = new Logger(WbApiHttpService.name);
  private readonly client: AxiosInstance;
  private logFilePath: string | null = null;
  private logBodyMax: number;
  private logEnabled: boolean;
  private logToConsole: boolean;
  private persistToDb: boolean;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WbApiCallLog)
    private readonly callLogRepo: Repository<WbApiCallLog>,
  ) {
    this.logEnabled =
      this.configService.get<string>('WB_API_LOG_ENABLED', 'true') === 'true';
    this.logToConsole =
      this.configService.get<string>('WB_API_LOG_TO_CONSOLE', 'false') ===
      'true';
    this.persistToDb =
      this.configService.get<string>('WB_API_PERSIST_TO_DB', 'true') ===
      'true';
    this.logBodyMax = parseInt(
      this.configService.get<string>('WB_API_LOG_MAX_BODY', '16384'),
      10,
    );
    const rawPath = this.configService.get<string>(
      'WB_API_LOG_FILE',
      join('logs', 'wb-api.jsonl'),
    );
    this.logFilePath = rawPath.trim() || null;

    this.client = axios.create();
    this.setupInterceptors();
  }

  async onModuleInit(): Promise<void> {
    if (this.persistToDb) {
      this.logger.log('WB API full responses are persisted to wb_api_call_logs');
    }
    if (!this.logEnabled || !this.logFilePath) {
      this.logger.log('WB API file logging is disabled');
      return;
    }
    try {
      await mkdir(dirname(this.logFilePath), { recursive: true });
      this.logger.log(`WB API logs → ${this.logFilePath}`);
    } catch (e) {
      this.logger.error(
        `Failed to create log directory: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use((config) => {
      config.wbMeta = { startMs: Date.now() };
      return config;
    });

    this.client.interceptors.response.use(
      async (response) => {
        await this.writeLogEntry(
          {
            outcome: 'success',
            method: (response.config.method ?? 'GET').toUpperCase(),
            url: response.config.url ?? '',
            baseURL: response.config.baseURL,
            params: response.config.params,
            requestHeaders: pickRequestHeaders(response.config.headers),
            status: response.status,
            statusText: response.statusText,
            durationMs:
              Date.now() - (response.config.wbMeta?.startMs ?? Date.now()),
            responseHeaders: this.pickResponseHeaders(response.headers),
            responseBody: summarizeBody(response.data, this.logBodyMax),
          },
          {
            persistBody: response.data,
            clientId: response.config.wbContext?.clientId ?? null,
          },
        );
        return response;
      },
      async (error: AxiosError) => {
        const cfg = error.config;
        const start = cfg?.wbMeta?.startMs ?? Date.now();
        await this.writeLogEntry(
          {
            outcome: 'error',
            method: (cfg?.method ?? 'GET').toUpperCase(),
            url: cfg?.url ?? '',
            params: cfg?.params,
            requestHeaders: cfg ? pickRequestHeaders(cfg.headers) : {},
            durationMs: Date.now() - start,
            errorMessage: error.message,
            errorCode: error.code,
            status: error.response?.status,
            statusText: error.response?.statusText,
            responseHeaders: error.response
              ? this.pickResponseHeaders(error.response.headers)
              : undefined,
            responseBody: error.response?.data
              ? summarizeBody(error.response.data, this.logBodyMax)
              : undefined,
          },
          {
            persistBody: error.response?.data,
            clientId: cfg?.wbContext?.clientId ?? null,
          },
        );
        return Promise.reject(error);
      },
    );
  }

  private pickResponseHeaders(headers: AxiosResponse['headers']): Record<string, string> {
    const out: Record<string, string> = {};
    if (!headers || typeof headers !== 'object') return out;
    const h = headers as Record<string, unknown>;
    for (const key of ['content-type', 'x-ratelimit-retry', 'retry-after']) {
      const found = Object.keys(h).find((k) => k.toLowerCase() === key);
      if (found && h[found] != null) {
        out[found] = String(h[found]);
      }
    }
    return out;
  }

  private serializeJsonb(value: unknown): unknown {
    if (value === undefined) return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return { _nonSerializable: String(value) };
    }
  }

  private normalizeParams(
    params: InternalAxiosRequestConfig['params'],
  ): Record<string, unknown> | null {
    if (params == null) return null;
    if (typeof params === 'object' && !Array.isArray(params)) {
      return params as Record<string, unknown>;
    }
    return { value: params as unknown };
  }

  private async persistCallToDatabase(
    outcome: WbApiCallOutcome,
    payload: Record<string, unknown>,
    persistBody: unknown,
    clientId: string | null,
  ): Promise<void> {
    if (!this.persistToDb) return;

    try {
      const row = this.callLogRepo.create({
        client_id: clientId,
        outcome,
        method: String(payload.method ?? 'GET'),
        url: String(payload.url ?? ''),
        http_status:
          payload.status === undefined || payload.status === null
            ? null
            : Number(payload.status),
        duration_ms: Number(payload.durationMs ?? 0),
        error_message:
          payload.errorMessage != null
            ? String(payload.errorMessage)
            : null,
        error_code:
          payload.errorCode != null ? String(payload.errorCode) : null,
        request_params: this.normalizeParams(
          payload.params as InternalAxiosRequestConfig['params'],
        ),
        response_body: this.serializeJsonb(persistBody),
      });
      await this.callLogRepo.save(row);
    } catch (e) {
      this.logger.error(
        `WB API DB log failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private async writeLogEntry(
    payload: Record<string, unknown>,
    opts?: { persistBody?: unknown; clientId?: string | null },
  ): Promise<void> {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      service: 'wildberries-api',
      ...payload,
    });

    if (this.logToConsole) {
      this.logger.log(
        `[WB] ${String(payload.outcome)} ${String(payload.method)} ${String(payload.url)} status=${payload.status ?? 'n/a'} ${String(payload.durationMs)}ms`,
      );
    }

    const outcome = payload.outcome as WbApiCallOutcome;
    await this.persistCallToDatabase(
      outcome,
      payload,
      opts?.persistBody,
      opts?.clientId ?? null,
    );

    if (!this.logEnabled || !this.logFilePath) return;

    try {
      await appendFile(this.logFilePath, line + '\n', { encoding: 'utf8' });
    } catch (e) {
      this.logger.error(
        `WB API log write failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config);
  }

  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data, config);
  }
}
