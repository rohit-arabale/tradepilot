import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, ArrowUpRight } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { Globe } from "../../components/Globe";

export default function CreateAccount() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [signupError, setSignupError] = useState<string>("");
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, []);

  const createMutation = trpc.auth.createAccount.useMutation({
    onSuccess: (data: { token: string; [key: string]: unknown }) => {
      localStorage.setItem("token", data.token);
      setSignupError("");
      const next = searchParams.get("next") || "/dashboard";
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
      navTimerRef.current = setTimeout(() => navigate(next), 200);
    },
    onError: (error: { message: string }) => {
      setSignupError(error.message || "Sign up failed");
    },
  });

  const loading = createMutation.isPending;

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleCreate = () => {
    if (loading) return;
    if (!firstName.trim() || !email || !password) {
      setSignupError("First name, email, and password are required.");
      return;
    }
    if (!isValidEmail(email)) {
      setSignupError("That email doesn't look right.");
      return;
    }
    if (password.length < 8) {
      setSignupError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setSignupError("Passwords don't match.");
      return;
    }
    setSignupError("");
    createMutation.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
      emailAddress: email,
      password,
    });
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
          Create your account
        </h1>
        <p className="text-sm text-center text-gray-600 mt-2">
          Start planning routes, verifying shipments, and screening for compliance.
        </p>

        <div className="mt-10 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="su-first"
              label="First name"
              value={firstName}
              onChange={setFirstName}
              placeholder="Ayush"
              autoComplete="given-name"
              disabled={loading}
            />
            <Field
              id="su-last"
              label="Last name"
              value={lastName}
              onChange={setLastName}
              placeholder="Yadav"
              autoComplete="family-name"
              disabled={loading}
            />
          </div>

          <Field
            id="su-email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@company.com"
            autoComplete="email"
            disabled={loading}
          />

          <div>
            <label htmlFor="su-pwd" className="text-sm font-medium text-gray-700 mb-1.5 block">
              Password
            </label>
            <div className="relative">
              <input
                id="su-pwd"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
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
          </div>

          <Field
            id="su-confirm"
            label="Confirm password"
            type={showPassword ? "text" : "password"}
            value={confirm}
            onChange={setConfirm}
            placeholder="Re-enter password"
            autoComplete="new-password"
            disabled={loading}
            onEnter={handleCreate}
          />

          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium px-5 py-3 rounded-xl text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            {loading ? "Creating account…" : (
              <>
                Create account
                <ArrowUpRight size={16} />
              </>
            )}
          </button>

          {signupError && (
            <p className="text-sm text-red-600 text-center" role="alert">{signupError}</p>
          )}

          <p className="text-center text-sm text-gray-600 mt-6">
            Already have an account?{" "}
            <Link to="/" className="text-gray-900 font-medium hover:underline">
              Sign in
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
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
  onEnter,
}: {
  id: string;
  label: string;
  type?: string;
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
