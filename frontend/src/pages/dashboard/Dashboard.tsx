import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { trpc } from "../../lib/trpc";
import FeatureGroupGrid from "../../components/FeatureGroupGrid";

function Dashboard() {
  const navigate = useNavigate();
  const { isError } = trpc.auth.getMe.useQuery(undefined, {
    retry: false,
    enabled: !!localStorage.getItem("token"),
  });

  useEffect(() => {
    if (!localStorage.getItem("token")) navigate("/");
    else if (isError) navigate("/");
  }, [navigate, isError]);

  return (
    <div className="relative space-y-16">
      <Hero navigate={navigate} />

      <section className="relative pb-24">
        <FeatureGroupGrid />
      </section>

      <Footer navigate={navigate} />
    </div>
  );
}

function Hero({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  return (
    <section className="flex flex-col items-center px-4 pt-20 sm:pt-28 pb-8 max-w-6xl mx-auto">
      {/* NEW chip */}
      <div className="flex items-center gap-2 pl-2.5 pr-4 py-1.5 rounded-full border border-gray-300">
        <p className="px-2 py-0.5 rounded-full border border-emerald-600 bg-emerald-100 text-[10px] font-semibold text-emerald-700">
          NEW
        </p>
        <p className="text-sm text-gray-700">Gemini 2.5 Flash route planning is live</p>
      </div>

      {/* Headline */}
      <h1 className="text-5xl md:text-[64px] leading-[1.1] md:leading-[1.05] text-center font-medium text-gray-900 max-w-[760px] mt-6">
        The platform behind verifiable shipments
      </h1>

      {/* Subhead */}
      <p className="text-sm md:text-base text-center max-w-[520px] mt-3 text-gray-700">
        Plan a route, verify a shipment, screen for compliance — every step visible, every decision explainable.
      </p>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-3 mt-10">
        <button
          onClick={() => navigate("/routes")}
          className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
        >
          Plan a route
          <ArrowUpRight size={16} />
        </button>
        <button
          onClick={() => navigate("/inspect")}
          className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 text-gray-950 font-medium px-5 py-2.5 rounded-xl text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
        >
          Verify a shipment
          <ArrowUpRight size={16} />
        </button>
      </div>

      {/* Preview mock — diagram of the platform surface */}
      <div className="w-full mt-12">
        <PreviewMock onPick={navigate} />
      </div>
    </section>
  );
}

/**
 * Lightweight SVG-free preview that mocks the platform's three main surfaces
 * — routes, inspect, risk — so the hero has weight without needing an image.
 * Each panel is clickable and routes to the actual feature.
 */
function PreviewMock({ onPick }: { onPick: (p: string) => void }) {
  return (
    <div className="border border-gray-200 rounded-[20px] p-3 bg-white">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          onClick={() => onPick("/routes")}
          className="text-left border border-gray-200 rounded-2xl p-5 hover:border-gray-400 transition-colors group"
        >
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</p>
          <h3 className="mt-2 text-lg font-medium text-gray-900">Mumbai → Rotterdam</h3>
          <div className="mt-4 space-y-2 text-xs text-gray-600">
            <Row label="Cost" value="$5,612" />
            <Row label="Time" value="2 – 3 days" />
            <Row label="Carbon" value="190 kg CO₂e" />
          </div>
          <p className="mt-4 text-xs font-medium text-gray-900 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Open routes <ArrowUpRight size={12} />
          </p>
        </button>

        <button
          onClick={() => onPick("/inspect")}
          className="text-left border border-gray-200 rounded-2xl p-5 hover:border-gray-400 transition-colors group"
        >
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Verify</p>
          <h3 className="mt-2 text-lg font-medium text-gray-900">Trust score 92</h3>
          <div className="mt-4 space-y-2 text-xs text-gray-600">
            <Row label="Camera" value="48 / 48" check />
            <Row label="Weight" value="1.4 t / 1.4 t" check />
            <Row label="RFID" value="48 / 50" check />
          </div>
          <p className="mt-4 text-xs font-medium text-gray-900 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Open inspect <ArrowUpRight size={12} />
          </p>
        </button>

        <button
          onClick={() => onPick("/risk")}
          className="text-left border border-gray-200 rounded-2xl p-5 hover:border-gray-400 transition-colors group"
        >
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Screen</p>
          <h3 className="mt-2 text-lg font-medium text-gray-900">Compliance: ready</h3>
          <div className="mt-4 space-y-2 text-xs text-gray-600">
            <Row label="HS code" value="8517.62" />
            <Row label="Dual-use" value="No" />
            <Row label="Restricted" value="None" />
          </div>
          <p className="mt-4 text-xs font-medium text-gray-900 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Open risk <ArrowUpRight size={12} />
          </p>
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, check }: { label: string; value: string; check?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${check ? "text-emerald-700" : "text-gray-900"}`}>{value}</span>
    </div>
  );
}

function Footer({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center text-white font-medium text-[10px]">
            TP
          </span>
          <span className="font-medium text-gray-900 text-sm">TradePilot</span>
        </div>
        <p className="text-xs text-gray-500">
          Plan, verify, and screen every shipment.
        </p>
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <a
            href="https://github.com/rohit-arabale/tradepilot"
            target="_blank"
            rel="noreferrer"
            className="hover:text-gray-900"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

export default Dashboard;
