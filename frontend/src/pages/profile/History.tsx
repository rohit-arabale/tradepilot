import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  Route,
  Package,
  Trash2,
  Clock,
  Image,
  Maximize2,
  X,
} from "lucide-react";
import { trpc } from "../../lib/trpc";

const HistoryTab: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>("compliance");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const {
    data: complianceData,
    isLoading: complianceLoading,
    isError: complianceError,
    refetch: refetchCompliance,
  } = trpc.compliance.history.useQuery(undefined, { retry: false });

  const {
    data: routeData,
    isLoading: routeLoading,
    isError: routeError,
    refetch: refetchRoute,
  } = trpc.logistics.getRouteHistory.useQuery(undefined, { retry: false });

  const {
    data: productAnalysisData,
    isLoading: productLoading,
    isError: productError,
    refetch: refetchProductAnalysis,
  } = trpc.compliance.productAnalysisHistory.useQuery(undefined, { retry: false });

  const complianceHistory = complianceData?.complianceHistory ?? [];
  const routeHistory = routeData?.routeHistory ?? [];
  const productAnalysisHistory = productAnalysisData?.productAnalysisHistory ?? [];

  const loading = complianceLoading || routeLoading || productLoading;

  const [deleteError, setDeleteError] = useState<string>("");

  const deleteComplianceMutation = trpc.compliance.deleteRecord.useMutation({
    onSuccess: () => { setDeleteError(""); void refetchCompliance(); },
    onError: () => { setDeleteError("Failed to delete compliance record."); },
  });

  const deleteRouteMutation = trpc.logistics.deleteRouteRecord.useMutation({
    onSuccess: () => { setDeleteError(""); void refetchRoute(); },
    onError: () => { setDeleteError("Failed to delete route record."); },
  });

  const deleteProductAnalysisMutation = trpc.compliance.deleteProductAnalysis.useMutation({
    onSuccess: () => { setDeleteError(""); void refetchProductAnalysis(); },
    onError: () => { setDeleteError("Failed to delete product analysis record."); },
  });

  const tabs = [
    { value: "compliance", label: "Compliance",       icon: ShieldCheck },
    { value: "route",      label: "Saved Routes",     icon: Route       },
    { value: "product",    label: "Product Analysis", icon: Package     },
  ];

  if (loading) {
    return (
      <div className="space-y-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border-b border-slate-100 pb-5">
            <div className="h-4 bg-slate-100 rounded w-48 mb-3" />
            <div className="h-16 bg-slate-50 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {deleteError && (
        <p className="text-sm text-red-600" role="alert">{deleteError}</p>
      )}
      {/* Flat tab bar */}
      <div className="flex border-b border-slate-200 gap-6 pb-px overflow-x-auto">
        {tabs.map(({ value, label, icon: Icon }) => (
          <button key={value} onClick={() => setActiveTab(value)}
            className={`flex items-center gap-2 px-1 py-3 border-b-2 text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === value
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Compliance tab */}
      {activeTab === "compliance" && (
        <>
          {complianceError ? (
            <div className="py-8 text-center">
              <p className="text-red-600 mb-4 text-sm">Failed to load compliance history.</p>
              <button onClick={() => void refetchCompliance()}
                className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg">
                Retry
              </button>
            </div>
          ) : complianceHistory.length === 0 ? (
            <div className="py-16 text-center">
              <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 mb-5">No compliance checks yet.</p>
              <button onClick={() => navigate("/compliance")}
                className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg">
                Run your first compliance check
              </button>
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-y-auto pr-1 space-y-0" style={{ scrollbarGutter: "stable" }}>
              {complianceHistory.map((entry: any, index: number) => (
                <div key={entry._id} className="border-b border-slate-100 last:border-0 py-5">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-400">#{index + 1}</span>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">Compliance Check</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {new Date(entry.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        entry.complianceResponse.complianceStatus === "Ready for Shipment"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}>
                        {entry.complianceResponse.complianceStatus}
                      </span>
                      <button onClick={() => deleteComplianceMutation.mutate({ recordId: entry._id })}
                        className="p-2 text-red-400 hover:text-red-600 rounded-lg" aria-label="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Risk Assessment</p>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-slate-500">Score:</span>
                        <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${
                            entry.complianceResponse.riskLevel.riskScore >= 80 ? "bg-emerald-500"
                              : entry.complianceResponse.riskLevel.riskScore >= 60 ? "bg-yellow-500"
                              : "bg-red-500"
                          }`} style={{ width: `${entry.complianceResponse.riskLevel.riskScore}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-700">{entry.complianceResponse.riskLevel.riskScore}</span>
                      </div>
                      <p className="text-xs text-slate-500">{entry.complianceResponse.summary}</p>
                    </div>
                    {entry.formData?.ShipmentDetails && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Shipment Details</p>
                        <dl className="space-y-1 text-xs">
                          {[
                            ["Origin",      entry.formData.ShipmentDetails["Origin Country"]],
                            ["Destination", entry.formData.ShipmentDetails["Destination Country"]],
                            ["HS Code",     entry.formData.ShipmentDetails["HS Code"]],
                            ["Weight",      `${entry.formData.ShipmentDetails["Gross Weight"]} kg`],
                          ].map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-4">
                              <dt className="text-slate-500">{k}</dt>
                              <dd className="font-medium text-slate-700">{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )}
                  </div>

                  {entry.complianceResponse.violations?.length > 0 && (
                    <div className="mt-4 border-l-2 border-red-300 pl-4">
                      <p className="text-xs font-semibold text-red-700 mb-1">Violations</p>
                      <ul className="space-y-0.5">
                        {entry.complianceResponse.violations.map((v: any, i: number) => (
                          <li key={i} className="text-xs text-red-600"><strong>{v.field}:</strong> {v.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Routes tab */}
      {activeTab === "route" && (
        <>
          {routeError ? (
            <div className="py-8 text-center">
              <p className="text-red-600 mb-4 text-sm">Failed to load route history.</p>
              <button onClick={() => void refetchRoute()}
                className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg">
                Retry
              </button>
            </div>
          ) : routeHistory.length === 0 ? (
            <div className="py-16 text-center">
              <Route className="w-10 h-10 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 mb-5">No saved routes yet.</p>
              <button onClick={() => navigate("/routes")}
                className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg">
                Optimize your first route
              </button>
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-y-auto pr-1" style={{ scrollbarGutter: "stable" }}>
              {routeHistory.map((entry: any, index: number) => (
                <div key={entry._id} className="border-b border-slate-100 last:border-0 py-5">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-400">#{index + 1}</span>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">Route Optimization</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {new Date(entry.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Saved</span>
                      <button onClick={() => deleteRouteMutation.mutate({ recordId: entry._id })}
                        className="p-2 text-red-400 hover:text-red-600 rounded-lg" aria-label="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Route Overview</p>
                      <dl className="space-y-1 text-xs">
                        {[
                          ["From",         entry.formData?.from || "N/A"],
                          ["To",           entry.formData?.to || "N/A"],
                          ["Weight",       `${entry.formData?.weight || "N/A"} kg`],
                          ["Distance",     `${entry.routeData?.totalDistance || "N/A"} km`],
                          ["Carbon Score", entry.routeData?.totalCarbonScore || "N/A"],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-4">
                            <dt className="text-slate-500">{k}</dt>
                            <dd className={`font-medium ${k === "Carbon Score" ? "text-emerald-600" : "text-slate-700"}`}>{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    {entry.routeData?.routeDirections?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Route Directions</p>
                        <div className="space-y-2">
                          {entry.routeData.routeDirections.map((dir: any, i: number) => (
                            <div key={dir.id || i} className="flex items-center gap-2 text-xs">
                              <div className="w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0 text-[10px]">{i + 1}</div>
                              <span className="font-medium text-slate-700">{dir.waypoints[0]} → {dir.waypoints[1]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Product Analysis tab */}
      {activeTab === "product" && (
        <>
          {productError ? (
            <div className="py-8 text-center">
              <p className="text-red-600 mb-4 text-sm">Failed to load product analysis history.</p>
              <button onClick={() => void refetchProductAnalysis()}
                className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg">
                Retry
              </button>
            </div>
          ) : productAnalysisHistory.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 mb-5">No product analyses yet.</p>
              <button onClick={() => navigate("/compliance")}
                className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg">
                Analyse your first product
              </button>
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-y-auto pr-1" style={{ scrollbarGutter: "stable" }}>
              {productAnalysisHistory.map((entry: any, index: number) => (
                <div key={entry._id} className="border-b border-slate-100 last:border-0 py-5">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-400">#{index + 1}</span>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">Product Analysis</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {new Date(entry.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => deleteProductAnalysisMutation.mutate({ recordId: entry._id })}
                      className="p-2 text-red-400 hover:text-red-600 rounded-lg" aria-label="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Product Details</p>
                      <dl className="space-y-1 text-xs">
                        {[
                          ["HS Code",     entry.geminiResponse["HS Code"]],
                          ["Description", entry.geminiResponse["Product Description"]],
                          ["Perishable",  entry.geminiResponse.Perishable ? "Yes" : "No"],
                          ["Hazardous",   entry.geminiResponse.Hazardous  ? "Yes" : "No"],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-4">
                            <dt className="text-slate-500">{k}</dt>
                            <dd className="font-medium text-slate-700">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Product Image</p>
                      {entry.imageDetails?.signedUrl ? (
                        <div className="relative w-full h-40">
                          <img src={entry.imageDetails.signedUrl} alt="Product" loading="lazy"
                            className="w-full h-full object-contain rounded-lg border border-slate-100"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder-image.jpg"; }}
                          />
                          <button onClick={() => setSelectedImage(entry.imageDetails.signedUrl)}
                            className="absolute bottom-2 right-2 bg-slate-800 text-white p-1.5 rounded-full hover:bg-slate-700"
                            aria-label="Expand image">
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-full h-40 flex flex-col items-center justify-center border border-slate-100 rounded-lg">
                          <Image className="w-6 h-6 text-slate-300 mb-1" />
                          <p className="text-xs text-slate-400">No image available</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {entry.geminiResponse["Required Export Document List"]?.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Required Documents</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {entry.geminiResponse["Required Export Document List"].map((doc: string, i: number) => (
                          <li key={i} className="text-xs text-slate-600">{doc}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Image lightbox — modal is an allowed card */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setSelectedImage(null)}>
          <div className="relative bg-white rounded-2xl p-6 max-w-3xl w-full mx-4 border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedImage(null)} aria-label="Close"
              className="absolute top-4 right-4 bg-red-600 rounded-full p-2 text-white hover:bg-red-700">
              <X className="w-4 h-4" />
            </button>
            <img src={selectedImage} alt="Expanded Product" className="w-full h-auto max-h-[70vh] object-contain rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryTab;
