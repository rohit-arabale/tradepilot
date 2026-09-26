import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  RotateCcw,
  Scan,
} from "lucide-react";
import { trpc } from "../../lib/trpc";
import AIThinking from "../../components/AIThinking";
import ReferenceNewsButton from "../../components/ReferenceNewsButton";

// ─── constants ────────────────────────────────────────────────────────────────
const DETECT_INTERVAL_MS = 3000;
const HISTORY_LIMIT = 20;

// ─── types ────────────────────────────────────────────────────────────────────
interface Finding {
  object: string;
  observations: string;
  flags: string[];
  severity: "ok" | "low" | "medium" | "high";
}

type Mode = "idle" | "starting" | "live" | "analyzing" | "result" | "error";

function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SEVERITY_STYLE: Record<Finding["severity"], { bg: string; border: string; text: string; pill: string }> = {
  ok: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", pill: "bg-emerald-100 text-emerald-700" },
  low: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", pill: "bg-slate-100 text-slate-700" },
  medium: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", pill: "bg-amber-100 text-amber-800" },
  high: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", pill: "bg-red-100 text-red-800" },
};

interface BoxCountTabProps {
  draftId: string;
  onResult?: (passed: boolean) => void;
}

export default function BoxCountTab({ draftId, onResult }: BoxCountTabProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [cameraError, setCameraError] = useState<string>("");
  const [detected, setDetected] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [findings, setFindings] = useState<Finding[]>([]);
  const [verdict, setVerdict] = useState<"clean" | "flagged" | null>(null);
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const mountedRef = useRef(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectingRef = useRef(false);

  const utils = trpc.useUtils();
  const detectMutation = trpc.boxCount.detectObjects.useMutation();
  const analyzeMutation = trpc.boxCount.analyzeSelected.useMutation();
  const saveSessionMutation = trpc.boxCount.saveSession.useMutation({
    onSuccess: () => {
      utils.boxCount.history.invalidate().catch(() => void 0);
    },
  });
  const historyQuery = trpc.boxCount.history.useQuery({ limit: HISTORY_LIMIT });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCameraInternal();
      if (detectTimerRef.current) clearInterval(detectTimerRef.current);
      detectTimerRef.current = null;
    };
  }, []);

  const stopCameraInternal = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = captureRef.current;
    if (!video || !canvas || !video.videoWidth) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.75);
  }, []);

  const runDetect = useCallback(async () => {
    if (detectingRef.current || !mountedRef.current) return;
    const dataUrl = captureFrame();
    if (!dataUrl) return;
    const base64 = dataUrl.split(",")[1] ?? "";
    detectingRef.current = true;
    setPulse(true);
    try {
      const res = await detectMutation.mutateAsync({
        imageBase64: base64,
        mimeType: "image/jpeg",
      });
      if (!mountedRef.current) return;
      setDetected((prev) => {
        const merged = Array.from(new Set([...res.objects, ...prev])).slice(0, 8);
        return merged;
      });
    } catch {
      /* swallow — one bad frame shouldn't break the UX */
    } finally {
      detectingRef.current = false;
      if (mountedRef.current) {
        setTimeout(() => mountedRef.current && setPulse(false), 400);
      }
    }
  }, [captureFrame, detectMutation]);

  const startCamera = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((res) => {
          const v = videoRef.current!;
          if (v.readyState >= 2) return res();
          v.onloadeddata = () => res();
        });
      }
      if (mountedRef.current) setCameraError("");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Camera access was denied.";
      if (mountedRef.current) setCameraError(msg);
      return false;
    }
  };

  const start = async () => {
    if (mode === "starting" || mode === "live") return;
    setMode("starting");
    setDetected([]);
    setSelected(new Set());
    setFindings([]);
    setVerdict(null);
    setFrozenFrame(null);
    setSaveStatus(null);

    const ok = await startCamera();
    if (!mountedRef.current) return;
    if (!ok) {
      setMode("error");
      return;
    }

    setMode("live");
    // First detect right away so chips appear within seconds.
    runDetect();
    detectTimerRef.current = setInterval(runDetect, DETECT_INTERVAL_MS);
  };

  const stopDetectLoop = () => {
    if (detectTimerRef.current) clearInterval(detectTimerRef.current);
    detectTimerRef.current = null;
  };

  const analyze = async () => {
    if (selected.size === 0) return;
    const dataUrl = captureFrame();
    if (!dataUrl) return;
    const base64 = dataUrl.split(",")[1] ?? "";

    stopDetectLoop();
    setFrozenFrame(dataUrl);
    setMode("analyzing");

    try {
      const res = await analyzeMutation.mutateAsync({
        imageBase64: base64,
        mimeType: "image/jpeg",
        selectedObjects: Array.from(selected),
      });
      if (!mountedRef.current) return;
      setFindings(res.findings);
      setVerdict(res.overallVerdict);
      setMode("result");
      onResult?.(res.overallVerdict === "clean");

      // Persist as a history record. Reuses BoxCountResult since the shape is loose:
      // detectedCount = number of findings, mismatch = flagged verdict.
      try {
        await saveSessionMutation.mutateAsync({
          draftId: draftId.trim() || undefined,
          declaredCount: 0,
          detectedCount: res.findings.length,
          confidence: 0.85,
          notes: `Inspected: ${Array.from(selected).join(", ")} · Verdict: ${res.overallVerdict}`,
        });
        setSaveStatus({ kind: "ok", text: "Inspection saved to history." });
      } catch (err) {
        setSaveStatus({
          kind: "err",
          text: `Save failed: ${err instanceof Error ? err.message : "unknown"}`,
        });
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setMode("result");
      setVerdict("flagged");
      setFindings([]);
      setSaveStatus({
        kind: "err",
        text: `Analyze failed: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
  };

  const reset = () => {
    stopCameraInternal();
    stopDetectLoop();
    setMode("idle");
    setDetected([]);
    setSelected(new Set());
    setFindings([]);
    setVerdict(null);
    setFrozenFrame(null);
    setCameraError("");
    setSaveStatus(null);
  };

  const scanAgain = () => {
    // Resume live detection from the existing camera stream.
    setFindings([]);
    setVerdict(null);
    setFrozenFrame(null);
    setSelected(new Set());
    setSaveStatus(null);
    if (streamRef.current) {
      setMode("live");
      runDetect();
      detectTimerRef.current = setInterval(runDetect, DETECT_INTERVAL_MS);
    } else {
      start();
    }
  };

  const toggleSelect = (obj: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(obj)) next.delete(obj);
      else next.add(obj);
      return next;
    });
  };

  const isLiveOrResult = mode === "live" || mode === "analyzing" || mode === "result";

  return (
    <div className="space-y-6">
      <canvas ref={captureRef} className="hidden" aria-hidden="true" />

      {/* Camera feed */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
        <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${frozenFrame ? "opacity-0" : "opacity-100"}`}
            aria-label="Inspection feed"
          />
          {frozenFrame && (
            <img
              src={frozenFrame}
              alt="Frozen inspection frame"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {mode === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-2 bg-slate-900">
              <Camera className="w-10 h-10" />
              <p className="text-sm">Camera preview inactive</p>
            </div>
          )}

          {mode === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-200 gap-2 bg-slate-900/95">
              <span className="w-8 h-8 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
              <p className="text-sm">Starting camera…</p>
            </div>
          )}

          {mode === "analyzing" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/60">
              <span className="w-10 h-10 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              <p className="text-sm font-semibold text-white">Inspecting selected objects…</p>
            </div>
          )}

          {/* Live "what I see" HUD */}
          {mode === "live" && (
            <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 text-white text-xs font-semibold">
              <span className={`w-2 h-2 rounded-full bg-emerald-400 ${pulse ? "animate-ping" : ""}`} />
              <span>AI watching</span>
            </div>
          )}
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          {!isLiveOrResult && (
            <button
              type="button"
              onClick={start}
              disabled={mode === "starting"}
              className="flex-1 px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-slate-400"
            >
              <Camera className="w-4 h-4" /> Start camera
            </button>
          )}

          {mode === "live" && (
            <>
              <button
                type="button"
                onClick={analyze}
                disabled={selected.size === 0}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4" />
                {selected.size === 0
                  ? "Pick something to analyze"
                  : `Analyze ${selected.size} selected`}
              </button>
              <button
                type="button"
                onClick={reset}
                className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
              >
                Stop
              </button>
            </>
          )}

          {mode === "result" && (
            <>
              <button
                type="button"
                onClick={scanAgain}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2"
              >
                <Scan className="w-4 h-4" /> Scan again
              </button>
              <button
                type="button"
                onClick={reset}
                className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Done
              </button>
            </>
          )}
        </div>
      </div>

      {/* AIThinking — shown below the video card while AI is analyzing */}
      {mode === "analyzing" && (
        <AIThinking
          steps={[
            "Inspecting selected objects…",
            "Cross-checking visual signals…",
            "Generating per-object findings…",
          ]}
          intervalMs={1600}
        />
      )}

      {/* Camera error */}
      {cameraError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl flex items-center gap-2 text-sm" role="alert">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Camera: {cameraError}
        </div>
      )}

      {/* "I see…" chip rail — only while live */}
      {mode === "live" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">
              I see — tap to pick what to inspect
            </h3>
            <span className="text-xs text-slate-400">
              {selected.size > 0 && `${selected.size} selected`}
            </span>
          </div>
          {detected.length === 0 ? (
            <>
              <p className="text-sm text-slate-400 italic">
                Looking at the frame… objects will appear here.
              </p>
              {detectMutation.isPending && (
                <AIThinking
                  steps={["Scanning frame for objects…"]}
                  className="mt-3"
                />
              )}
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {detected.map((obj) => {
                const isSelected = selected.has(obj);
                return (
                  <button
                    key={obj}
                    type="button"
                    onClick={() => toggleSelect(obj)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      isSelected
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {isSelected && "✓ "}
                    {obj}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Result — per-object cards + overall verdict */}
      {mode === "result" && (
        <div className="space-y-4">
          {verdict && (
            <div
              className={`p-4 rounded-xl border flex items-center gap-3 ${
                verdict === "clean"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              {verdict === "clean" ? (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="text-sm font-semibold">
                {verdict === "clean"
                  ? "All selected objects passed inspection."
                  : "One or more objects were flagged. Review below."}
              </span>
            </div>
          )}

          {findings.length > 0 && (
            <div className="space-y-3">
              {findings.map((f, i) => {
                const s = SEVERITY_STYLE[f.severity];
                return (
                  <div
                    key={`${f.object}-${i}`}
                    className={`p-4 rounded-xl border ${s.bg} ${s.border}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className={`font-semibold capitalize ${s.text}`}>{f.object}</h4>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase ${s.pill}`}>
                        {f.severity}
                      </span>
                    </div>
                    <p className={`text-sm leading-relaxed ${s.text}`}>{f.observations}</p>
                    {f.flags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {f.flags.map((flag, j) => (
                          <span
                            key={`${flag}-${j}`}
                            className={`text-xs px-2 py-0.5 rounded-full ${s.pill}`}
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Market insights for the primary inspected product */}
              <ReferenceNewsButton
                subject={findings[0]?.object ?? "cargo inspection"}
                kind="product"
              />
            </div>
          )}
        </div>
      )}

      {saveStatus && (
        <div
          className={`p-3 rounded-xl flex items-center gap-2 text-sm border ${
            saveStatus.kind === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
          role="status"
        >
          {saveStatus.kind === "ok" ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          )}
          {saveStatus.text}
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-800">Check History</h3>
          <button
            onClick={() => historyQuery.refetch()}
            className="text-xs text-slate-500 hover:text-slate-700 font-semibold"
          >
            Refresh
          </button>
        </div>
        {historyQuery.isLoading ? (
          <div className="space-y-3">
            <div className="h-10 bg-slate-100 rounded" />
            <div className="h-10 bg-slate-100 rounded" />
          </div>
        ) : historyQuery.data && historyQuery.data.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {(historyQuery.data as unknown as Array<{
              _id: string;
              detectedCount: number;
              mismatch: boolean;
              notes: string;
              createdAt: string | Date;
            }>).map((item) => (
              <div key={item._id} className="py-3 flex justify-between items-start text-sm gap-4">
                <div className="flex items-start gap-2 min-w-0">
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                      item.mismatch ? "bg-red-500" : "bg-emerald-500"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-700">
                      {item.detectedCount} object{item.detectedCount === 1 ? "" : "s"} inspected
                    </div>
                    {item.notes && (
                      <div className="text-xs text-slate-500 truncate">{item.notes}</div>
                    )}
                  </div>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">
                  {fmtDate(item.createdAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-6">No historical records found.</p>
        )}
      </div>
    </div>
  );
}
