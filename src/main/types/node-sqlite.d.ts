declare module 'node:sqlite' {
  export class Database {
    static open(path: string): Promise<Database>
    exec(sql: string): Array<{ values: Array<any> }>
    prepare(sql: string): Statement
    close(): void
  }

  export interface Statement {
    run(params: any[]): void
    finalize(): void
  }
}
