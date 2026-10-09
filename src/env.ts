export type Env = Cloudflare.Env & {
  MEMORY_READ_TOKEN: string;
  MEMORY_WRITE_TOKEN: string;
  GITHUB_TOKEN: string;
  GITHUB_WEBHOOK_SECRET?: string;
  MEMORY_CONTENT_SEARCH?: string | boolean;
  MEMORY_WEBHOOK_ENABLED?: string | boolean;
};
