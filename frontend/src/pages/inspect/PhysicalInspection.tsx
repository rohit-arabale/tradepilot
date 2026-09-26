import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Camera, Scale, Tag, Diff, CheckCircle2, Circle } from "lucide-react";
import PageLead from "../../components/PageLead";
import TrustGauge from "../../components/TrustGauge";
import NewsContextCard from "../../components/NewsContextCard";

import BoxCountTab from "./BoxCountTab";
import WeightCheckTab from "./WeightCheckTab";
import RfidVerificationTab from "./RfidVerificationTab";
import ShipmentDiffTab from "./ShipmentDiffTab";

type SubsystemTab = "camera" | "weight" | "rfid" | "diff";

interface SubsystemStatus {
  camera: boolean | null;
  weight: boolean | null;
  rfid: boolean | null;
  diff: boolean | null;
}

const INITIAL_STATUS: SubsystemStatus = {
  camera: null,
  weight: null,
  rfid: null,
  diff: null,
};

function computeTrustScore(status: SubsystemStatus): number {
  const values = Object.values(status);
  const completed = values.filter((v) => v !== null);
  if (completed.length === 0) return 50; // neutral default
  const passed = values.filter((v) => v === true).length;
  return Math.round((passed / 4) * 100);
}

export default function PhysicalInspection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<SubsystemTab>(
    (searchParams.get("tab") as SubsystemTab) ?? "camera"
  );
  const [subsystemStatus, setSubsystemStatus] =
    useState<SubsystemStatus>(INITIAL_STATUS);

  useEffect(() => {
    const params: Record<string, string> = { tab: activeTab };
    setSearchParams(params, { replace: true });
  }, [activeTab, setSearchParams]);

  const handleResult = useCallback(
    (key: keyof SubsystemStatus) => (passed: boolean) => {
      setSubsystemStatus((prev) => ({ ...prev, [key]: passed }));
    },
    []
  );

  const trustScore = computeTrustScore(subsystemStatus);

  const tabs: {
    id: SubsystemTab;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    statusKey: keyof SubsystemStatus;
  }[] = [
    { id: "camera", label: "Camera", Icon: Camera, statusKey: "camera" },
    { id: "weight", label: "Weight Check", Icon: Scale, statusKey: "weight" },
    { id: "rfid", label: "RFID Tagging", Icon: Tag, statusKey: "rfid" },
    { id: "diff", label: "Tamper Diff", Icon: Diff, statusKey: "diff" },
  ];

  function StatusDot({ passed }: { passed: boolean | null }) {
    if (passed === null) return <Circle className="w-3 h-3 text-slate-300" />;
    if (passed)
      return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
    return <CheckCircle2 className="w-3 h-3 text-red-400" />;
  }

  const completedCount = Object.values(subsystemStatus).filter(
    (v) => v !== null
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12">
      <PageLead
        title="Verify a shipment"
        sub="Run camera count, scale weight, RFID match, and damage diff against the manifest. Trust score updates after each check."
      />

      <NewsContextCard
        surface="inspect"
        origin=""
        destination=""
      />

      {/* Two-column layout: tabs + trust panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: tab strip + content */}
        <div className="lg:col-span-8">
          {/* Tab strip — flat underlined style */}
          <div className="flex border-b border-slate-200 gap-6 overflow-x-auto pb-px">
            {tabs.map((tab) => {
              const { Icon } = tab;
              const isActive = activeTab === tab.id;
              const status = subsystemStatus[tab.statusKey];
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-1 py-3 border-b-2 text-sm font-semibold whitespace-nowrap transition-colors focus:outline-none ${
                    isActive
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  <StatusDot passed={status} />
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="pt-6">
            {activeTab === "camera" && (
              <BoxCountTab
                draftId=""
                onResult={handleResult("camera")}
              />
            )}
            {activeTab === "weight" && (
              <WeightCheckTab
                draftId=""
                onResult={handleResult("weight")}
              />
            )}
            {activeTab === "rfid" && (
              <RfidVerificationTab
                draftId=""
                onResult={handleResult("rfid")}
              />
            )}
            {activeTab === "diff" && (
              <ShipmentDiffTab
                draftId=""
                onResult={handleResult("diff")}
              />
            )}
          </div>
        </div>

        {/* Right: Trust Score + Subsystem Summary — single merged section */}
        <aside className="lg:col-span-4 space-y-8">
          <section className="flex flex-col items-center gap-4">
            <h3 className="text-xl font-bold text-slate-900 self-start">
              Trust Score
            </h3>
            <TrustGauge
              value={trustScore}
              size={180}
              label="Inspection"
              subLabel={
                completedCount === 0
                  ? "No checks run yet"
                  : `${completedCount}/4 subsystems`
              }
            />
            <p className="text-sm text-slate-500 text-center leading-relaxed">
              Score updates as each subsystem completes. Run checks in each tab.
            </p>
          </section>

          <section className="border-t border-slate-200 pt-8 space-y-3">
            <h3 className="text-xl font-bold text-slate-900">
              Subsystem Summary
            </h3>
            {tabs.map((tab) => {
              const status = subsystemStatus[tab.statusKey];
              const { Icon } = tab;
              return (
                <div
                  key={tab.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    status === true
                      ? "bg-emerald-50 border-emerald-200"
                      : status === false
                      ? "bg-red-50 border-red-200"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Icon className="w-4 h-4 text-slate-500" />
                    {tab.label}
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      status === true
                        ? "bg-emerald-100 text-emerald-700"
                        : status === false
                        ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {status === true
                      ? "Pass"
                      : status === false
                      ? "Fail"
                      : "Pending"}
                  </span>
                </div>
              );
            })}
          </section>
        </aside>
      </div>
    </div>
  );
}
