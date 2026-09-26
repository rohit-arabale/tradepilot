import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@server/routers/_app";

export const trpc = createTRPCReact<AppRouter>();

// Default backend per build mode when VITE_API_URL is not set:
//   - dev:  local backend on PORT 5050
//   - prod: deployed VM (Caddy proxies /trpc to the Node service)
const DEFAULT_API_URL = import.meta.env.DEV
  ? "http://localhost:5050"
  : "https://tradepilot.duckdns.org";

export const apiBaseUrl =
  (import.meta.env.VITE_API_URL as string | undefined) ?? DEFAULT_API_URL;

export const trpcUrl = `${apiBaseUrl}/trpc`;
