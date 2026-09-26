import React, { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Upload, X, AlertTriangle, RefreshCcw, Sparkles } from "lucide-react";
import CountUp from "../../components/CountUp";
import CardSkeleton from "../../components/skeletons/CardSkeleton";
import AIThinking from "../../components/AIThinking";
import ReferenceNewsButton from "../../components/ReferenceNewsButton";
import { trpc } from "../../lib/trpc";

// ─── constants ────────────────────────────────────────────────────────────────
const RISK_HIGH = 61;
const RISK_MED = 31;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

const DEMO_BEFORE_URL = "https://images.unsplash.com/photo-1553413077-190dd305871c?w=1200&q=80";
const DEMO_AFTER_URL  = "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=80";

type InputMode = "photos" | "weights";

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function riskColor(score: number): string {
  if (score >= RISK_HIGH) return "text-red-600";
  if (score >= RISK_MED) return "text-amber-600";
  return "text-emerald-600";
}

function riskStrokeColor(score: number): string {
  if (score >= RISK_HIGH) return "#ef4444";
  if (score >= RISK_MED) return "#f59e0b";
  return "#10b981";
}

function riskBadgeColor(score: number): string {
  if (score >= RISK_HIGH) return "bg-red-100 text-red-700 border-red-200";
  if (score >= RISK_MED) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function riskLabel(score: number): string {
  if (score >= RISK_HIGH) return "High Risk";
  if (score >= RISK_MED) return "Medium Risk";
  return "Low Risk";
}

function deviationSeverityColor(pct: number): string {
  if (pct >= 15) return "text-red-600";
  if (pct >= 5) return "text-amber-600";
  return "text-emerald-600";
}

function deviationSeverityBadge(pct: number): string {
  if (pct >= 15) return "bg-red-100 text-red-700 border-red-200";
  if (pct >= 5) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function deviationSeverityLabel(pct: number): string {
  if (pct >= 15) return "High Deviation";
  if (pct >= 5) return "Moderate Deviation";
  return "Within Tolerance";
}

function deviationSummary(beforeKg: number, afterKg: number, pct: number): string {
  const diff = Math.abs(afterKg - beforeKg);
  if (pct >= 15)
    return `Significant weight loss of ${diff.toFixed(1)} kg (${pct.toFixed(1)}%) detected — possible cargo tampering or undeclared removal.`;
  if (pct >= 5)
    return `Moderate weight discrepancy of ${diff.toFixed(1)} kg (${pct.toFixed(1)}%) — investigate handling and transfer records.`;
  return `Weight variation of ${diff.toFixed(1)} kg (${pct.toFixed(1)}%) is within acceptable tolerance.`;
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RiskGauge({ score }: { score: number }) {
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  return (
    <div className="relative w-44 h-44" aria-label={`Risk score: ${score}`}>
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="80" cy="80" r={radius} stroke="#e2e8f0" strokeWidth="10" fill="none" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          stroke={riskStrokeColor(score)}
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className={`text-4xl font-extrabold tabular-nums ${riskColor(score)}`}>
          <CountUp value={score} />
        </p>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-1">
          Risk Score
        </p>
      </div>
    </div>
  );
}

function ScanImage({
  label,
  preview,
  scanning,
  onPick,
  inputId,
}: {
  label: string;
  preview: string;
  scanning: boolean;
  onPick: () => void;
  inputId: string;
}) {
  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-semibold text-slate-700 mb-2">
        {label}
      </label>
      <div
        role="button"
        tabIndex={0}
        onClick={onPick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onPick(); }}
        className="relative cursor-pointer border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl overflow-hidden bg-slate-50"
        style={{ minHeight: 200 }}
      >
        {preview ? (
          <img src={preview} alt={`${label} preview`} className="w-full h-56 object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center h-56 text-slate-400 gap-2 px-4">
            <Upload className="w-7 h-7" aria-hidden="true" />
            <span className="text-sm text-center">Click to upload {label.toLowerCase()}</span>
          </div>
        )}
        {scanning && preview && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 pointer-events-none">
            <span className="px-2 py-0.5 rounded-md bg-gray-900 text-white text-[10px] font-bold tracking-wider">
              ANALYZING
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface ShipmentDiffTabProps {
  draftId: string;
  onResult?: (passed: boolean) => void;
}

interface WeightResult {
  beforeKg: number;
  afterKg: number;
  deviationPct: number;
}

export default function ShipmentDiffTab({ draftId, onResult }: ShipmentDiffTabProps) {
  // ─── mode toggle ──────────────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState<InputMode>("photos");

  // ─── photo mode state ─────────────────────────────────────────────────────
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [beforePreview, setBeforePreview] = useState<string>("");
  const [afterPreview, setAfterPreview] = useState<string>("");
  // track whether the preview URLs are Unsplash URLs (not object URLs)
  const [isDemoMode, setIsDemoMode] = useState(false);

  const beforeInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);

  const beforePreviewRef = useRef(beforePreview);
  const afterPreviewRef = useRef(afterPreview);
  useEffect(() => { beforePreviewRef.current = beforePreview; }, [beforePreview]);
  useEffect(() => { afterPreviewRef.current = afterPreview; }, [afterPreview]);
  useEffect(() => {
    return () => {
      if (!isDemoMode) {
        if (beforePreviewRef.current) URL.revokeObjectURL(beforePreviewRef.current);
        if (afterPreviewRef.current) URL.revokeObjectURL(afterPreviewRef.current);
      }
    };
  }, [isDemoMode]);

  const [compareError, setCompareError] = useState<string>("");
  const utils = trpc.useUtils();
  const compareMutation = trpc.shipmentDiff.compare.useMutation({
    onSuccess: (data) => {
      setCompareError("");
      utils.shipmentDiff.history.invalidate().catch(() => void 0);
      onResult?.(data.riskScore < 31);
    },
    onError: (err) => {
      setCompareError(err.message ?? "Comparison failed. Please try again.");
    },
  });

  // ─── weight mode state ────────────────────────────────────────────────────
  const [beforeKg, setBeforeKg] = useState<string>("");
  const [afterKg, setAfterKg] = useState<string>("");
  const [weightResult, setWeightResult] = useState<WeightResult | null>(null);
  const [weightError, setWeightError] = useState<string>("");

  const weightSubmitMutation = trpc.weightCheck.submit.useMutation();

  const historyQuery = trpc.shipmentDiff.history.useQuery({ limit: 20 });

  // ─── demo data ────────────────────────────────────────────────────────────
  const handleLoadDemo = () => {
    if (!isDemoMode) {
      // revoke existing object URLs if any
      if (beforePreview && !isDemoMode) URL.revokeObjectURL(beforePreview);
      if (afterPreview && !isDemoMode) URL.revokeObjectURL(afterPreview);
    }
    setBeforeFile(null);
    setAfterFile(null);
    setBeforePreview(DEMO_BEFORE_URL);
    setAfterPreview(DEMO_AFTER_URL);
    setIsDemoMode(true);
    setCompareError("");
    compareMutation.reset();
  };

  // ─── file upload ──────────────────────────────────────────────────────────
  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    slot: "before" | "after"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setCompareError(`Image is larger than 10 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
      e.target.value = "";
      return;
    }
    if (!file.type.startsWith("image/")) {
      setCompareError("Please select an image file.");
      e.target.value = "";
      return;
    }
    setCompareError("");
    setIsDemoMode(false);
    if (slot === "before") {
      if (beforePreview && !isDemoMode) URL.revokeObjectURL(beforePreview);
      setBeforeFile(file);
      setBeforePreview(URL.createObjectURL(file));
    } else {
      if (afterPreview && !isDemoMode) URL.revokeObjectURL(afterPreview);
      setAfterFile(file);
      setAfterPreview(URL.createObjectURL(file));
    }
    e.target.value = "";
  };

  const handleReset = () => {
    if (!isDemoMode) {
      if (beforePreview) URL.revokeObjectURL(beforePreview);
      if (afterPreview) URL.revokeObjectURL(afterPreview);
    }
    setBeforeFile(null);
    setAfterFile(null);
    setBeforePreview("");
    setAfterPreview("");
    setIsDemoMode(false);
    compareMutation.reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const hasImages = isDemoMode
      ? (beforePreview !== "" && afterPreview !== "")
      : (beforeFile !== null && afterFile !== null);

    if (!hasImages) {
      if (!beforePreview && !afterPreview) {
        setCompareError("Please select both a before and after image.");
        return;
      }
      if (!beforePreview) {
        setCompareError("Please select the Before Loading image.");
        return;
      }
      if (!afterPreview) {
        setCompareError("Please select the After Delivery image.");
        return;
      }
    }
    setCompareError("");

    try {
      let beforeBase64: string;
      let afterBase64: string;
      let inferredMime: AllowedImageMime = "image/jpeg";

      if (isDemoMode) {
        [beforeBase64, afterBase64] = await Promise.all([
          urlToBase64(DEMO_BEFORE_URL),
          urlToBase64(DEMO_AFTER_URL),
        ]);
        inferredMime = "image/jpeg";
      } else {
        if (!beforeFile || !afterFile) {
          setCompareError("Please select both a before and after image.");
          return;
        }
        [beforeBase64, afterBase64] = await Promise.all([
          readFileAsBase64(beforeFile),
          readFileAsBase64(afterFile),
        ]);
        inferredMime = ALLOWED_IMAGE_MIME.find((m) => m === beforeFile.type) ?? "image/jpeg";
      }

      await compareMutation.mutateAsync({
        draftId: draftId.trim() || undefined,
        beforeImageBase64: beforeBase64,
        afterImageBase64: afterBase64,
        mimeType: inferredMime,
      });
    } catch {
      // handled by onError
    }
  };

  // ─── weight calculation ───────────────────────────────────────────────────
  const handleWeightSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const b = parseFloat(beforeKg);
    const a = parseFloat(afterKg);
    if (isNaN(b) || b <= 0) {
      setWeightError("Enter a valid before weight.");
      return;
    }
    if (isNaN(a) || a < 0) {
      setWeightError("Enter a valid after weight.");
      return;
    }
    setWeightError("");
    const pct = (Math.abs(a - b) / b) * 100;
    setWeightResult({ beforeKg: b, afterKg: a, deviationPct: pct });

    // persist via backend (fire-and-forget, don't block UI)
    weightSubmitMutation.mutate({
      draftId: draftId.trim() || undefined,
      declaredWeightKg: b,
      measuredWeightKg: a,
    });
  };

  const result = compareMutation.data;
  const isLoading = compareMutation.isPending;
  const hasPreview = beforePreview !== "" && afterPreview !== "";
  const hasFiles = isDemoMode ? hasPreview : (beforeFile !== null && afterFile !== null);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
        {/* Mode toggle + Demo button row */}
        <div className="flex items-center justify-between mb-5">
          {/* Chip toggle */}
          <div className="inline-flex items-center rounded-lg border border-slate-200 overflow-hidden text-sm font-medium">
            <button
              type="button"
              onClick={() => { setInputMode("photos"); setWeightResult(null); setWeightError(""); }}
              className={`px-3 py-1.5 transition-colors ${
                inputMode === "photos"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Photos
            </button>
            <button
              type="button"
              onClick={() => { setInputMode("weights"); compareMutation.reset(); }}
              className={`px-3 py-1.5 transition-colors border-l border-slate-200 ${
                inputMode === "weights"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Weights
            </button>
          </div>

          {/* Demo data button — only in photos mode */}
          {inputMode === "photos" && (
            <button
              type="button"
              onClick={handleLoadDemo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-slate-500" aria-hidden="true" />
              Demo Data
            </button>
          )}
        </div>

        {/* ── Photos mode ──────────────────────────────────────────────── */}
        {inputMode === "photos" && (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <ScanImage
                label="Before Loading"
                preview={beforePreview}
                scanning={isLoading}
                onPick={() => beforeInputRef.current?.click()}
                inputId="beforeInput"
              />
              <ScanImage
                label="After Delivery"
                preview={afterPreview}
                scanning={isLoading}
                onPick={() => afterInputRef.current?.click()}
                inputId="afterInput"
              />
              <input
                ref={beforeInputRef}
                id="beforeInput"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e, "before")}
              />
              <input
                ref={afterInputRef}
                id="afterInput"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e, "after")}
              />
            </div>

            {compareError && (
              <p className="text-sm text-red-600" role="alert">{compareError}</p>
            )}

            {hasFiles && (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium rounded-xl border border-slate-200 hover:border-slate-300"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-slate-400 text-white font-semibold rounded-xl text-sm"
                >
                  {isLoading ? "Analyzing…" : "Run Diff Analysis"}
                </button>
              </div>
            )}
          </form>
        )}

        {/* ── Weights mode ──────────────────────────────────────────────── */}
        {inputMode === "weights" && (
          <form onSubmit={handleWeightSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="beforeKg">
                  Before Weight (kg)
                </label>
                <input
                  id="beforeKg"
                  type="number"
                  min="0"
                  step="0.1"
                  value={beforeKg}
                  onChange={(e) => setBeforeKg(e.target.value)}
                  placeholder="e.g. 1200"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="afterKg">
                  After Weight (kg)
                </label>
                <input
                  id="afterKg"
                  type="number"
                  min="0"
                  step="0.1"
                  value={afterKg}
                  onChange={(e) => setAfterKg(e.target.value)}
                  placeholder="e.g. 900"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {weightError && (
              <p className="text-sm text-red-600" role="alert">{weightError}</p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-6 py-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl text-sm"
              >
                Calculate Deviation
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Weight result card ────────────────────────────────────────────── */}
      {inputMode === "weights" && weightResult && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-900">Weight Deviation</h2>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${deviationSeverityBadge(weightResult.deviationPct)}`}>
              {deviationSeverityLabel(weightResult.deviationPct)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Before</p>
              <p className="text-2xl font-bold text-slate-800">{weightResult.beforeKg.toFixed(1)} kg</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">After</p>
              <p className="text-2xl font-bold text-slate-800">{weightResult.afterKg.toFixed(1)} kg</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Deviation</p>
              <p className={`text-2xl font-bold ${deviationSeverityColor(weightResult.deviationPct)}`}>
                {weightResult.deviationPct.toFixed(1)}%
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            {deviationSummary(weightResult.beforeKg, weightResult.afterKg, weightResult.deviationPct)}
          </p>

          <ReferenceNewsButton subject="cargo damage tampering detection" kind="product" />
        </div>
      )}

      {/* ── Photo diff: error ─────────────────────────────────────────────── */}
      {inputMode === "photos" && compareMutation.error && !isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700">Comparison failed</p>
              <p className="text-sm text-red-600 mt-1 break-words">
                {compareMutation.error.message || "The diff pipeline returned an error."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => compareMutation.reset()}
              className="text-red-500 hover:text-red-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── AIThinking while mutation is pending ──────────────────────────── */}
      {inputMode === "photos" && isLoading && (
        <AIThinking
          steps={[
            "Comparing before/after frames…",
            "Identifying missing items…",
            "Estimating tampering probability…",
          ]}
        />
      )}

      {/* ── Photo diff result ─────────────────────────────────────────────── */}
      {inputMode === "photos" && result && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-900">Analysis Result</h2>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${riskBadgeColor(result.riskScore)}`}>
              {riskLabel(result.riskScore)}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <RiskGauge score={result.riskScore} />
            <div className="flex-1 grid grid-cols-2 gap-4 w-full">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Tampering Probability
                </p>
                <p className={`text-3xl font-bold ${riskColor(result.tamperingProbability * 100)}`}>
                  <CountUp value={result.tamperingProbability * 100} suffix="%" />
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Missing Items
                </p>
                <p className="text-3xl font-bold text-slate-800">
                  <CountUp value={result.missingItems.length} />
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 mt-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Summary</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{result.summary}</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Damage Description</h3>
              <blockquote className="text-sm text-slate-700 leading-relaxed bg-slate-50 border-l-4 border-blue-400 pl-4 pr-3 py-3 rounded-r-xl">
                {result.damageDescription || "No visible damage."}
              </blockquote>
            </div>

            {result.missingItems.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Missing Items</h3>
                <div className="flex flex-wrap gap-2">
                  {result.missingItems.map((item, i) => (
                    <span
                      key={`${item}-${i}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-medium"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <ReferenceNewsButton subject="cargo damage tampering detection" kind="product" />
        </div>
      )}

      {/* ── Recent Comparisons ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Recent Comparisons</h2>
          <button
            type="button"
            onClick={() => historyQuery.refetch().catch(() => void 0)}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
          >
            <RefreshCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Refresh
          </button>
        </div>

        {historyQuery.isLoading ? (
          <div className="space-y-3">
            <CardSkeleton height={64} />
            <CardSkeleton height={64} />
            <CardSkeleton height={64} />
          </div>
        ) : historyQuery.error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4" role="alert">
            <p className="text-sm text-red-700 font-medium">Failed to load history.</p>
            <button
              type="button"
              onClick={() => historyQuery.refetch().catch(() => void 0)}
              className="text-xs text-red-600 hover:text-red-700 underline mt-1"
            >
              Retry
            </button>
          </div>
        ) : !historyQuery.data || historyQuery.data.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-40" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-500">No comparisons yet</p>
            <p className="text-xs mt-1">Upload two images to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {historyQuery.data.map((record) => {
              const id = (record._id as unknown as { toString(): string }).toString();
              return (
                <div
                  key={id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border border-slate-100 rounded-xl hover:border-slate-200 hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate">{record.summary}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {fmtDate(record.createdAt as Date)}
                      {record.draftId ? ` · Draft: ${record.draftId}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${riskBadgeColor(record.riskScore)}`}>
                      {riskLabel(record.riskScore)} ({record.riskScore})
                    </span>
                    <span className="text-xs text-slate-500">
                      {Math.round(record.tamperingProbability * 100)}% tamper
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
