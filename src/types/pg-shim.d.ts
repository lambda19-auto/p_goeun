declare module "pg" {
  export interface QueryResultRow {
    [column: string]: unknown;
  }

  export class Pool {
    constructor(config?: Record<string, unknown>);
    query<T = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
    connect(): Promise<{
      query<T = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
      release(): void;
    }>;
  }
}
