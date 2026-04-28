import 'axios';

declare module 'axios' {
  export interface AxiosRequestConfig {
    wbMeta?: { startMs: number };
    wbContext?: { clientId?: string };
  }
}
