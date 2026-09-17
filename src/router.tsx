// TEMP-PERF: earliest JS mark — runs at bundle evaluation, before anything else.
import { pmark } from "@/lib/noma/perf-instrumentation";

pmark("js-bundle-start");

import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
