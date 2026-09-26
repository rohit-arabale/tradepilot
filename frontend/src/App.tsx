import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import Login from "./pages/auth/Login";
import CreateAccount from "./pages/auth/CreateAccount";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/dashboard/Dashboard";
import PhysicalInspection from "./pages/inspect/PhysicalInspection";
import RiskCenter from "./pages/risk/RiskCenter";
import RoutePlanning from "./pages/routes/RoutePlanning";
import Fleet from "./pages/fleet/Fleet";
import Compliance from "./pages/compliance/Compliance";
import Profile from "./pages/profile/Profile";

// ─────────────────────────────────────────────────────────────
// ErrorBoundary — catches render-phase errors anywhere in the
// subtree and renders a graceful fallback (AlertTriangle + message
// + Reload). No stack trace is exposed to the user.
// ─────────────────────────────────────────────────────────────
interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log to console for developers; never expose to the UI.
    console.error("[ErrorBoundary] Uncaught render error:", error, info);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
          <AlertTriangle
            size={48}
            className="text-amber-500"
            aria-hidden="true"
          />
          <p className="text-slate-700 text-lg font-semibold">
            Something went wrong. Please reload the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Login />} />
      <Route path="/createAccount" element={<CreateAccount />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/inspect" element={<PhysicalInspection />} />
        <Route path="/risk" element={<RiskCenter />} />
        <Route path="/routes" element={<RoutePlanning />} />
        <Route path="/fleet" element={<Fleet />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export { ErrorBoundary };
export default App;
