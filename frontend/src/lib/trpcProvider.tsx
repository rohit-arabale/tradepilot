import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { trpc, trpcUrl } from "./trpc";

// V4 / H5: query defaults — staleTime avoids hammering on every mount;
// retry: 1 so a single transient failure doesn't cascade.
const DEFAULT_STALE_TIME = 5_000; // ms
const DEFAULT_RETRY = 1;

interface TrpcProviderProps {
  children: React.ReactNode;
}

export function TrpcProvider({ children }: TrpcProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: DEFAULT_STALE_TIME,
            retry: DEFAULT_RETRY,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: trpcUrl,
          transformer: superjson,
          headers: () => {
            const token = localStorage.getItem("token");
            return token ? { Authorization: "Bearer " + token } : {};
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}

export default TrpcProvider;
