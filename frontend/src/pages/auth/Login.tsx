import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, ArrowUpRight } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { Globe } from "../../components/Globe";

export default function Login() {
  const [emailAddress, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loginError, setLoginError] = useState<string>("");
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, []);

  const loginMutation = trpc.auth.loginUser.useMutation({
    onSuccess: (data: { token: string; [key: string]: unknown }) => {
      localStorage.setItem("token", data.token);
      setLoginError("");
      const next = searchParams.get("next") || "/dashboard";
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
      navTimerRef.current = setTimeout(() => navigate(next), 200);
    },
    onError: (error: { message: string }) => {
      setLoginError(error.message || "Login failed");
    },
  });

  const loading = loginMutation.isPending;

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleLogin = () => {
    if (loading) return;
    if (!emailAddress || !password) {
      setLoginError("Email and password are required.");
      return;
    }
    if (!isValidEmail(emailAddress)) {
      setLoginError("That email doesn't look right.");
      return;
    }
    setLoginError("");
    loginMutation.mutate({ emailAddress, password });
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left: globe — desktop only */}
      <aside className="hidden lg:flex relative items-center justify-center bg-gray-50 overflow-hidden border-r border-gray-100">
        <Globe />
        <div className="absolute bottom-10 left-10 right-10 pointer-events-none">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
            TradePilot
          </p>
          <h2 className="mt-2 text-2xl font-medium text-gray-900 leading-snug max-w-xs">
            Plan, verify, and screen every shipment — across every corridor.
          </h2>
        </div>
      </aside>

      {/* Right: auth form */}
      <div className="flex flex-col items-center px-4 py-10">
      <Link to="/" className="flex items-center gap-2 mb-12">
        <span className="w-8 h-8 bg-gray-900 rounded-xl flex items-center justify-center text-white font-bold text-[10px]">
          TP
        </span>
        <span className="font-medium text-gray-900 text-base">TradePilot</span>
      </Link>

      <div className="w-full max-w-sm">
        <h1 className="text-3xl md:text-4xl font-medium text-gray-900 text-center">
          Welcome back
        </h1>
        <p className="text-sm text-center text-gray-600 mt-2">
          Sign in to plan, verify, and screen shipments.
        </p>

        <div className="mt-10 space-y-4">
          <Field
            id="login-email"
            label="Email"
            type="email"
            value={emailAddress}
            onChange={setEmail}
            placeholder="you@company.com"
            autoComplete="email"
            disabled={loading}
            onEnter={handleLogin}
          />

          <div>
            <label htmlFor="login-password" className="text-sm font-medium text-gray-700 mb-1.5 block">
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
                className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-200 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 disabled:opacity-60 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 rounded"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none mt-3 mb-4">
              <input
                type="checkbox"
                checked={emailAddress === "demo@gmail.com" && password === "abc123"}
                onChange={(e) => {
                  if (e.target.checked) {
                    setEmail("demo@gmail.com");
                    setPassword("abc123");
                  } else {
                    setEmail("");
                    setPassword("");
                  }
                }}
                className="w-4 h-4 rounded border border-gray-300 text-gray-900 accent-gray-900 focus:ring-2 focus:ring-gray-900 focus:ring-offset-1"
              />
              <span className="text-sm text-gray-600">
                Use demo credentials <span className="text-gray-400">(demo@gmail.com · abc123)</span>
              </span>
            </label>
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium px-5 py-3 rounded-xl text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            {loading ? "Signing in…" : (
              <>
                Sign in
                <ArrowUpRight size={16} />
              </>
            )}
          </button>

          {loginError && (
            <p className="text-sm text-red-600 text-center" role="alert">{loginError}</p>
          )}

          <p className="text-center text-sm text-gray-600 mt-6">
            Don't have an account?{" "}
            <Link to="/createAccount" className="text-gray-900 font-medium hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
  onEnter,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  onEnter?: () => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-gray-700 mb-1.5 block">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        className="w-full px-4 py-3 rounded-lg border border-gray-200 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 disabled:opacity-60 transition-colors"
      />
    </div>
  );
}
