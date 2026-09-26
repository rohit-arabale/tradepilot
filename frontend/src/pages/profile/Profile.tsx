import React, { useState } from "react";
import { Settings, History, BarChart2 } from "lucide-react";
import ManageAccount from "./ManageAccount";
import HistoryTab from "./History";
import AnalysisTab from "./Analysis";
import PageLead from "../../components/PageLead";

type ProfileTab = "settings" | "history" | "analysis";

export default function Profile() {
  const [activeTab, setActiveTab] = useState<ProfileTab>("settings");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <PageLead
        title="Your account"
        sub="Profile details, every action you've taken on the platform, and a breakdown of the shipments you've handled."
      />

      <div className="flex border-b border-slate-200 gap-6 pb-px overflow-x-auto">
        {(
          [
            { id: "settings", label: "Account Settings", icon: Settings },
            { id: "history",  label: "Activity History",  icon: History  },
            { id: "analysis", label: "Shipment Analysis", icon: BarChart2 },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-1 py-3 border-b-2 text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "settings" && <ManageAccount />}
      {activeTab === "history"  && <HistoryTab />}
      {activeTab === "analysis" && <AnalysisTab />}
    </div>
  );
}
