import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  ShieldAlert,
  Navigation,
  Truck,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";

interface FeatureLink {
  path: string;
  title: string;
  desc: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface FeatureGroup {
  id: string;
  label: string;
  description: string;
  items: FeatureLink[];
}

const GROUPS: FeatureGroup[] = [
  {
    id: "verification",
    label: "Security & Verification",
    description: "Physical inspection checks and aggregated risk metrics.",
    items: [
      {
        path: "/inspect",
        title: "Physical Inspection",
        desc: "Camera, scale, and RFID verification.",
        Icon: Camera,
      },
      {
        path: "/risk",
        title: "Risk & Trust Center",
        desc: "Shipment risk scores and anomaly scans.",
        Icon: ShieldAlert,
      },
    ],
  },
  {
    id: "operations",
    label: "Logistics Operations",
    description: "Fleet tracking, routing, and corridor optimization.",
    items: [
      {
        path: "/routes",
        title: "Route Planning",
        desc: "Optimize paths for cost and carbon.",
        Icon: Navigation,
      },
      {
        path: "/fleet",
        title: "Fleet & Corridors",
        desc: "Truck registry and load matching.",
        Icon: Truck,
      },
    ],
  },
  {
    id: "records",
    label: "Compliance & Intake",
    description: "Regulatory forms and manifest registries.",
    items: [
      {
        path: "/compliance",
        title: "Compliance Check",
        desc: "HS-Code extraction and form screening.",
        Icon: ShieldCheck,
      },
    ],
  },
];

const FeatureGroupGrid: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section
      className="relative max-w-6xl mx-auto px-6 space-y-12"
      aria-label="Feature groups"
    >
      {GROUPS.map((group) => (
        <div key={group.id}>
          <div className="mb-5">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 text-gray-900 text-[11px] font-semibold uppercase tracking-wider border border-gray-300">
              {group.label}
            </span>
            <p className="text-sm text-gray-500 mt-1.5">
              {group.description}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {group.items.map((item) => {
              const { Icon } = item;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="text-left bg-white rounded-2xl border border-gray-200 hover:border-gray-400 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 text-gray-900">
                      <Icon size={20} />
                    </span>
                    <ChevronRight
                      size={16}
                      className="text-gray-300"
                    />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed mt-1">
                    {item.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
};

export default FeatureGroupGrid;
