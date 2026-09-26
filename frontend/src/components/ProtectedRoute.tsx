import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { trpc } from "../lib/trpc";
import NavBar from "./NavBar";

// V1: Loading skeleton that matches a typical protected page layout
// (Header bar + content placeholder) so navigation doesn't flash blank.
const PageLoadingSkeleton: React.FC = () => (
  <div
    className="min-h-screen bg-slate-50"
    role="status"
    aria-label="Loading page"
  >
    {/* Header skeleton — matches the blue rounded-b-3xl Header shape */}
    <div className="max-w-7xl mx-auto">
      <div className="h-[120px] bg-blue-500/30 rounded-b-3xl mx-0" />
    </div>

    {/* Content placeholder */}
    <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-8 space-y-4">
      {/* Title bar */}
      <div className="h-8 w-56 bg-slate-200 rounded-xl" />

      {/* Card row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 bg-slate-200 rounded-2xl border border-slate-200"
          />
        ))}
      </div>

      {/* Body content block */}
      <div className="h-64 bg-slate-200 rounded-2xl mt-4" />
      <div className="h-40 bg-slate-200 rounded-2xl" />
    </div>

    <span className="sr-only">Loading…</span>
  </div>
);

const ProtectedRoute: React.FC = () => {
  // Gate the request on the presence of a token so an anonymous visit to a
  // protected URL doesn't fire an UNAUTHORIZED request before redirecting.
  const hasToken =
    typeof window !== "undefined" && !!localStorage.getItem("token");

  const { data, isLoading, isError } = trpc.auth.getMe.useQuery(undefined, {
    retry: false,
    enabled: hasToken,
  });

  if (!hasToken) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) {
    return <PageLoadingSkeleton />;
  }

  const isAuthenticated = !!data && !isError;

  if (!isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />
      <Outlet />
    </div>
  );
};

export default ProtectedRoute;
