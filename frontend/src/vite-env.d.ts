/// <reference types="vite/client" />

// Stub declaration for papaparse (no @types/papaparse installed)
declare module 'papaparse' {
  interface ParseConfig {
    header?: boolean;
    skipEmptyLines?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    complete?: (results: { data: any[] }) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error?: (error: any) => void;
  }
  interface UnparseConfig {
    fields?: string[];
    data?: unknown[];
  }
  function parse(input: string | File, config?: ParseConfig): void;
  function unparse(data: object[] | UnparseConfig, config?: UnparseConfig): string;
  export { parse, unparse };
}

// Extend Vite's ImportMetaEnv with project-specific env vars
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_BACKEND_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
