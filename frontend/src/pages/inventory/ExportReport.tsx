import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Truck,
  Ship,
  Plane,
  MoreHorizontal,
} from "lucide-react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  PDFDownloadLink,
} from "@react-pdf/renderer";
import MapView from "./MapView";
import { trpc } from "../../lib/trpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Violation {
  field?: string;
  message?: string;
}

interface Recommendation {
  field?: string;
  message?: string;
}

interface ComplianceData {
  complianceStatus?: string;
  summary?: string;
  riskLevel?: { riskScore: number; summary: string };
  violations?: Violation[];
  recommendations?: Recommendation[];
  additionalTips?: string[];
  scores?: Record<string, number>;
}

interface RouteSegment {
  id: string;
  waypoints: string[];
  state: string;
}

interface RouteData {
  totalCost?: number;
  totalTime?: number;
  totalDistance?: number;
  totalCarbonScore?: number;
  routeDirections?: RouteSegment[];
  distanceByLeg?: number[];
}

interface ShipmentDetails {
  "Product Description"?: string;
  "Origin Country"?: string;
  "Destination Country"?: string;
  "HS Code"?: string;
  "Gross Weight"?: string | number;
  Package?: Record<string, unknown>;
}

interface FormData {
  ShipmentDetails?: ShipmentDetails;
  TradeAndRegulatoryDetails?: Record<string, unknown>;
  PartiesAndIdentifiers?: Record<string, unknown>;
  LogisticsAndHandling?: Record<string, unknown>;
  DocumentVerification?: Record<
    string,
    { checked: boolean; subItems: Record<string, boolean> }
  >;
  IntendedUseDetails?: Record<string, unknown>;
}

interface Draft {
  _id: string;
  formData: FormData;
  complianceData?: ComplianceData;
  routeData?: RouteData;
}

interface CarbonLeg {
  leg: string;
  origin: string;
  destination: string;
  mode: string;
  distance: string;
  emissions: string;
}

interface CarbonData {
  totalDistance: string;
  totalEmissions: string;
  routeAnalysis: CarbonLeg[];
  suggestions: string[];
  earthImpact: string;
  draftId?: string;
}

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          Something went wrong displaying the compliance results. Please try
          again.
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// ComplianceResponse
// ---------------------------------------------------------------------------

const ComplianceResponse: React.FC<{ response: ComplianceData | undefined; }> = ({
  response,
}) => {
  if (!response || Object.keys(response).length === 0) {
    return (
      <div className="p-4 bg-yellow-50 text-yellow-700 rounded-lg">
        No compliance results available.
      </div>
    );
  }

  const complianceStatus = response.complianceStatus ?? "Not Ready";
  const summary = response.summary ?? "No summary provided";
  const violations = response.violations ?? [];
  const recommendations = response.recommendations ?? [];
  const additionalTips = response.additionalTips ?? [];
  const riskLevel = response.riskLevel ?? {
    riskScore: 0,
    summary: "No risk assessment available",
  };
  const scores = response.scores ?? {};

  const chartData = [
    { name: "Shipment Details", score: scores.ShipmentDetails || 0 },
    { name: "Trade & Regulatory", score: scores.TradeAndRegulatoryDetails || 0 },
    { name: "Parties & Identifiers", score: scores.PartiesAndIdentifiers || 0 },
    { name: "Logistics & Handling", score: scores.LogisticsAndHandling || 0 },
    { name: "Intended Use", score: scores.IntendedUseDetails || 0 },
  ];

  return (
    <ErrorBoundary>
      <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
        <div>
          <h2 className="text-3xl font-bold text-indigo-800 mb-6 flex items-center">
            <span className="mr-2">
              {complianceStatus === "Ready for Shipment" ? (
                <CheckCircle
                  className="text-green-600"
                  style={{ width: "2rem", height: "2rem" }}
                />
              ) : (
                <AlertTriangle
                  className="text-red-600"
                  style={{ width: "2rem", height: "2rem" }}
                />
              )}
            </span>
            Compliance Check Results
          </h2>

          <div className="mb-6">
            <h3 className="text-xl font-semibold text-gray-800">Status</h3>
            <span
              className={`inline-block px-4 py-2 mt-2 rounded-full text-white font-medium shadow-sm ${
                riskLevel.riskScore < 30
                  ? "bg-green-600"
                  : riskLevel.riskScore < 60
                  ? "bg-yellow-600"
                  : "bg-red-600"
              }`}
            >
              {complianceStatus}
            </span>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-semibold text-gray-800">Summary</h3>
            <p className="mt-2 text-gray-600 leading-relaxed">{summary}</p>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-semibold text-gray-800">Risk Level</h3>
            <div className="mt-2">
              <p className="text-gray-600">
                Risk Score: {riskLevel.riskScore}/100
              </p>
              <div className="w-full bg-gray-200 rounded-full h-4 mt-2 shadow-inner">
                <div
                  style={{ width: `${riskLevel.riskScore}%` }}
                  className={`h-4 rounded-full ${
                    riskLevel.riskScore < 30
                      ? "bg-green-600"
                      : riskLevel.riskScore < 60
                      ? "bg-yellow-600"
                      : "bg-red-600"
                  }`}
                />
              </div>
              <p className="mt-2 text-gray-600 leading-relaxed">
                {riskLevel.summary}
              </p>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-semibold text-gray-800">
              Issues & Recommendations
            </h3>
            <div className="mt-2">
              {violations.length === 0 ? (
                <div className="flex items-center text-green-600">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  <span>No violations</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="min-w-full bg-white rounded-lg shadow-sm">
                  <thead>
                    <tr className="bg-indigo-100">
                      <th className="px-4 py-2 text-left text-indigo-800 font-semibold">
                        Field
                      </th>
                      <th className="px-4 py-2 text-left text-indigo-800 font-semibold">
                        Violation
                      </th>
                      <th className="px-4 py-2 text-left text-indigo-800 font-semibold">
                        Recommendation
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {violations.map((violation, index) => {
                      const matchingRecommendation = recommendations.find(
                        (rec) => rec.field === violation.field
                      );
                      return (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-800">
                            {violation.field || "Unknown"}
                          </td>
                          <td className="px-4 py-2 text-red-600">
                            {violation.message || "No message"}
                          </td>
                          <td className="px-4 py-2 text-green-600">
                            {matchingRecommendation?.message || "N/A"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-semibold text-gray-800">
              Compliance Scores
            </h3>
            <div className="mt-4">
              {chartData.map((item, index) => (
                <div
                  key={index}
                  className="flex justify-between py-2 px-3 bg-gray-50 rounded-md mb-1"
                >
                  <span className="text-gray-700">{item.name}</span>
                  <span className="text-indigo-600 font-medium">
                    {item.score}/100
                  </span>
                </div>
              ))}
            </div>
          </div>

          {additionalTips.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold text-gray-800">
                Additional Tips
              </h3>
              <ul className="mt-2 space-y-2">
                {additionalTips.map((tip, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-indigo-600 mr-2">•</span>
                    <span className="text-gray-600 leading-relaxed">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

// ---------------------------------------------------------------------------
// PDF styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 12,
    fontFamily: "Helvetica",
    backgroundColor: "#F9FAFB",
  },
  header: {
    backgroundColor: "#1E3A8A",
    color: "#FFFFFF",
    padding: 20,
    marginBottom: 20,
    borderRadius: 8,
  },
  title: { fontSize: 26, fontWeight: "bold", marginBottom: 10 },
  subtitle: { fontSize: 14, marginBottom: 5 },
  section: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#1F2937",
  },
  text: { fontSize: 12, marginBottom: 5, color: "#4B5563", lineHeight: 1.5 },
  subSection: { marginLeft: 10, marginBottom: 10 },
  table: {
    display: "flex",
    width: "100%",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    marginBottom: 10,
    borderRadius: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
  },
  tableHeader: {
    backgroundColor: "#E0E7FF",
    padding: 5,
    fontWeight: "bold",
    color: "#4F46E5",
  },
  tableCell: { padding: 5, width: "33.33%", fontSize: 11 },
  footer: {
    marginTop: 20,
    textAlign: "center",
    color: "#FFFFFF",
    backgroundColor: "#1E3A8A",
    padding: 10,
    borderRadius: 8,
  },
});

// ---------------------------------------------------------------------------
// PDFDocument
// ---------------------------------------------------------------------------

const PDFDocument: React.FC<{
  draft: Draft;
  user: string | null;
  generationDate: string;
  carbonData: CarbonData | null;
}> = ({ draft, user, generationDate, carbonData }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Export Report</Text>
        <Text style={styles.subtitle}>Prepared for: {user || "User"}</Text>
        <Text style={styles.subtitle}>Generated on: {generationDate}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Shipment Summary</Text>
        <Text style={styles.text}>
          Product:{" "}
          {draft.formData.ShipmentDetails?.["Product Description"]}
        </Text>
        <Text style={styles.text}>
          Route: {draft.formData.ShipmentDetails?.["Origin Country"]} to{" "}
          {draft.formData.ShipmentDetails?.["Destination Country"]}
        </Text>
        <Text style={styles.text}>
          Compliance: {draft.complianceData?.complianceStatus || "N/A"}
        </Text>
        <Text style={styles.text}>
          Carbon Score: {draft.routeData?.totalCarbonScore || "N/A"} kg CO2e
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Compliance Response</Text>
        {draft.complianceData &&
        Object.keys(draft.complianceData).length > 0 ? (
          <>
            <Text style={styles.text}>
              Status: {draft.complianceData.complianceStatus ?? "Not Ready"}
            </Text>
            <Text style={styles.text}>
              Summary: {draft.complianceData.summary ?? "No summary provided"}
            </Text>
            <Text style={styles.text}>
              Risk Score:{" "}
              {draft.complianceData.riskLevel?.riskScore ?? 0}/100
            </Text>
          </>
        ) : (
          <Text style={styles.text}>No compliance results available.</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Route Chosen</Text>
        <Text style={styles.text}>
          Total Cost: {draft.routeData?.totalCost || "N/A"} EUR
        </Text>
        <Text style={styles.text}>
          Total Time: {draft.routeData?.totalTime || "N/A"} hours
        </Text>
        <Text style={styles.text}>
          Total Distance: {draft.routeData?.totalDistance || "N/A"} km
        </Text>
        <Text style={styles.text}>
          Total Carbon Score:{" "}
          {draft.routeData?.totalCarbonScore || "N/A"} kg CO2e
        </Text>
      </View>

      {carbonData && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Carbon Footprint Summary</Text>
          <Text style={styles.text}>
            Total Distance: {carbonData.totalDistance}
          </Text>
          <Text style={styles.text}>
            Total Emissions: {carbonData.totalEmissions}
          </Text>
        </View>
      )}

      <Text style={styles.footer}>
        Report generated by TradePilot. Cargo is ready for shipment.
      </Text>
    </Page>
  </Document>
);

// ---------------------------------------------------------------------------
// ExportReport
// ---------------------------------------------------------------------------

function ExportReport(): React.ReactElement {
  const { draftId } = useParams<{ draftId: string }>();
  const [carbonData, setCarbonData] = useState<CarbonData | null>(null);
  const [carbonLoading, setCarbonLoading] = useState<boolean>(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState<boolean>(false);
  const downloadMenuRef = React.useRef<HTMLDivElement | null>(null);

  // Close the download menu when the user clicks anywhere outside of it so
  // the menu doesn't get stuck open after a single trigger click.
  useEffect(() => {
    if (!showDownloadMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (
        downloadMenuRef.current &&
        !downloadMenuRef.current.contains(e.target as Node)
      ) {
        setShowDownloadMenu(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showDownloadMenu]);

  const utils = trpc.useUtils();
  const calculateCarbonMutation =
    trpc.logistics.calculateCarbonFootprint.useMutation();

  // Fetch user
  const { data: meData, isLoading: userLoading, isError: userError } =
    trpc.auth.getMe.useQuery();

  // Fetch draft
  const {
    data: draftData,
    isLoading: draftLoading,
    isError: draftError,
    error: draftFetchError,
  } = trpc.inventory.getDraftById.useQuery(
    { id: draftId ?? "" },
    { enabled: !!draftId }
  );


  const loading = userLoading || draftLoading;
  const error =
    userError || draftError
      ? "We could not load this report. The draft may have been deleted, or there may be a connection issue."
      : null;

  // Log raw error for diagnostics
  useEffect(() => {
    if ((userError || draftError) && draftFetchError) {
      console.error("[ExportReport] Failed to load draft:", draftFetchError);
    }
  }, [userError, draftError, draftFetchError]);

  const user = meData
    ? `${(meData as any).user.firstName} ${(meData as any).user.lastName}`
    : null;
  const draft = (draftData as any)?.draft as Draft | undefined;

  // Fetch/generate carbon data once draft is available. Guard against
  // running every render — the draft object identity changes on each query
  // refetch even when the underlying _id hasn't changed, which would
  // otherwise re-trigger the expensive carbon-interface call repeatedly.
  const carbonRanForRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!draft || !draftId) return;
    if (carbonRanForRef.current === draftId) return;
    carbonRanForRef.current = draftId;

    const fetchAndGenerateCarbonData = async () => {
      setCarbonLoading(true);
      try {
        // Try fetching existing carbon data
        try {
          const carbonResponse = await utils.logistics.getCarbonFootprint.fetch(
            { draftId }
          );
          setCarbonData(carbonResponse as CarbonData);
          return;
        } catch {
          // Fall through to generate
        }

        if (!draft.routeData?.routeDirections?.length) return;

        const carbonParams = {
          draftId,
          origin: draft.routeData.routeDirections[0].waypoints[0],
          destination:
            draft.routeData.routeDirections[
              draft.routeData.routeDirections.length - 1
            ].waypoints[1],
          distance: draft.routeData.totalDistance ?? 0,
          weight: parseFloat(
            String(
              draft.formData.ShipmentDetails?.["Gross Weight"] ?? "0"
            )
          ),
          routeDirections: draft.routeData.routeDirections.map((d) => ({
            state: d.state,
            waypoints: d.waypoints,
          })),
          distanceByLeg: draft.routeData.distanceByLeg ?? [],
        };

        const carbonResponse =
          await calculateCarbonMutation.mutateAsync(carbonParams);
        setCarbonData(carbonResponse as unknown as CarbonData);
      } catch (err) {
        console.error("Error with carbon footprint data:", err);
        setCarbonData(null);
      } finally {
        setCarbonLoading(false);
      }
    };

    fetchAndGenerateCarbonData();
  }, [draft, draftId]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 sm:p-6 flex flex-col">
        <div className="flex flex-1 items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-lg text-gray-700 font-semibold tracking-wide">
              Generating your report...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 sm:p-6 flex flex-col">
        <div className="text-center bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-red-600 mb-4 font-medium">{error}</p>
          <button
            className="bg-gray-900 py-2 px-6 rounded-lg hover:bg-gray-800 text-white font-semibold focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            onClick={() => window.history.back()}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 sm:p-6 flex flex-col">
        <div className="text-center bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-red-600 mb-4 font-medium">Draft not found.</p>
          <button
            className="bg-gray-900 py-2 px-6 rounded-lg hover:bg-gray-800 text-white font-semibold focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            onClick={() => window.history.back()}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Validate draft data
  if (
    !draft.formData ||
    !draft.formData.ShipmentDetails ||
    !draft.formData.TradeAndRegulatoryDetails ||
    !draft.formData.PartiesAndIdentifiers ||
    !draft.formData.LogisticsAndHandling ||
    !draft.formData.DocumentVerification ||
    !draft.formData.IntendedUseDetails
  ) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 sm:p-6 flex flex-col">
        <div className="text-center bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-red-600 mb-4 font-medium">
            Incomplete draft data. Form data is missing or invalid.
          </p>
          <button
            className="bg-gray-900 py-2 px-6 rounded-lg hover:bg-gray-800 text-white font-semibold focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            onClick={() => window.history.back()}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const generationDate = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 flex flex-col">

      <div className="max-w-5xl mx-auto my-8 bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden flex-grow">
        {/* Header */}
        <div className="bg-indigo-700 p-6 sm:p-8 text-white relative">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Export Report
          </h1>
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:space-x-4">
            <p className="text-base sm:text-lg">
              Prepared for:{" "}
              <span className="font-semibold">{user || "User"}</span>
            </p>
            <p className="text-base sm:text-lg">
              Generated on:{" "}
              <span className="font-semibold">{generationDate}</span>
            </p>
          </div>
          <div ref={downloadMenuRef} className="absolute top-4 right-4">
            <button
              onClick={() => setShowDownloadMenu(!showDownloadMenu)}
              onKeyDown={(e) => { if (e.key === "Escape") setShowDownloadMenu(false); }}
              aria-label="Download options"
              aria-expanded={showDownloadMenu}
              aria-haspopup="menu"
              className="text-white hover:text-gray-200 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-700 rounded"
            >
              <MoreHorizontal className="w-6 h-6" />
            </button>
            <AnimatePresence>
            {showDownloadMenu && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                role="menu"
                className="absolute right-0 mt-2 w-48 bg-white rounded-lg border border-gray-200 shadow-sm z-10"
              >
                <PDFDownloadLink
                  document={
                    <PDFDocument
                      draft={draft}
                      user={user}
                      generationDate={generationDate}
                      carbonData={carbonData}
                    />
                  }
                  fileName={`ExportReport-${draftId}.pdf`}
                  role="menuitem"
                  className="block px-4 py-2 text-gray-800 hover:bg-gray-100 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                >
                  {({ loading: pdfLoading }) =>
                    pdfLoading ? "Generating PDF..." : "Download PDF"
                  }
                </PDFDownloadLink>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>

        {/* Shipment Summary */}
        <div className="mx-4 sm:mx-8 mt-6 p-6 bg-amber-50 border border-amber-200 rounded-xl shadow-sm">
          <h2 className="text-2xl font-semibold text-amber-800 mb-4">
            Shipment Summary
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center space-x-3">
              <Truck className="w-6 h-6 text-amber-600" />
              <p>
                <span className="font-medium">Product:</span>{" "}
                {draft.formData.ShipmentDetails["Product Description"]}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Plane className="w-6 h-6 text-amber-600" />
              <p>
                <span className="font-medium">Route:</span>{" "}
                {draft.formData.ShipmentDetails["Origin Country"]} to{" "}
                {draft.formData.ShipmentDetails["Destination Country"]}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-6 h-6 text-amber-600" />
              <p>
                <span className="font-medium">Compliance:</span>{" "}
                {draft.complianceData?.complianceStatus || "N/A"}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
              <p>
                <span className="font-medium">Carbon Score:</span>{" "}
                {draft.routeData?.totalCarbonScore || "N/A"} kg CO2e
              </p>
            </div>
          </div>
        </div>

        {/* Product Analysis */}
        <div className="p-6 sm:p-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Product Analysis
          </h2>

          <div className="mb-6">
            <h3 className="text-xl font-medium text-gray-700 mb-2">
              Shipment Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {Object.entries(draft.formData.ShipmentDetails).map(
                ([key, value]) => (
                  <div key={key}>
                    <p className="text-sm font-medium text-gray-600">{key}</p>
                    <p className="text-gray-800">{String(value)}</p>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-medium text-gray-700 mb-2">
              Trade and Regulatory Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {Object.entries(draft.formData.TradeAndRegulatoryDetails!).map(
                ([key, value]) => (
                  <div key={key}>
                    <p className="text-sm font-medium text-gray-600">{key}</p>
                    <p className="text-gray-800">
                      {typeof value === "object" && value !== null
                        ? `${(value as any).currency} ${(value as any).amount}`
                        : String(value)}
                    </p>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-medium text-gray-700 mb-2">
              Parties and Identifiers
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {Object.entries(draft.formData.PartiesAndIdentifiers!).map(
                ([key, value]) => (
                  <div key={key}>
                    <p className="text-sm font-medium text-gray-600">{key}</p>
                    <p className="text-gray-800">{String(value)}</p>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-medium text-gray-700 mb-2">
              Logistics and Handling
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {Object.entries(draft.formData.LogisticsAndHandling!).map(
                ([key, value]) => (
                  <div key={key}>
                    <p className="text-sm font-medium text-gray-600">{key}</p>
                    <p className="text-gray-800">{String(value) || "N/A"}</p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* Document Verification */}
        <div className="p-6 sm:p-8 bg-gray-50">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Document Verification
          </h2>
          <div className="space-y-4">
            {Object.entries(draft.formData.DocumentVerification!).map(
              ([doc, details]) => (
                <div
                  key={doc}
                  className="border border-gray-200 rounded-lg p-4 shadow-sm"
                >
                  <p className="text-lg font-medium text-gray-700">
                    {doc}:{" "}
                    {details.checked ? (
                      <CheckCircle className="inline w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="inline w-5 h-5 text-red-600" />
                    )}
                  </p>
                  <div className="ml-4 mt-2">
                    {Object.entries(details.subItems).map(
                      ([subKey, subValue]) => (
                        <p key={subKey} className="text-sm text-gray-600">
                          - {subKey}: {subValue ? "Yes" : "No"}
                        </p>
                      )
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Compliance Response */}
        <div className="p-6 sm:p-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Compliance Response
          </h2>
          <ComplianceResponse response={draft.complianceData} />
        </div>

        {/* Route Chosen */}
        <div className="p-6 sm:p-8 bg-gray-50">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Route Chosen
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Cost</p>
              <p className="text-gray-800">
                {draft.routeData?.totalCost != null
                  ? `${draft.routeData.totalCost} EUR`
                  : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Total Time</p>
              <p className="text-gray-800">
                {draft.routeData?.totalTime != null
                  ? `${draft.routeData.totalTime} hours`
                  : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">
                Total Distance
              </p>
              <p className="text-gray-800">
                {draft.routeData?.totalDistance != null
                  ? `${draft.routeData.totalDistance} km`
                  : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">
                Total Carbon Score
              </p>
              <p className="text-gray-800">
                {draft.routeData?.totalCarbonScore != null
                  ? `${draft.routeData.totalCarbonScore} kg CO2e`
                  : "N/A"}
              </p>
            </div>
          </div>
          <div className="mt-6">
            <p className="text-sm font-medium text-gray-600">Route Segments</p>
            <div className="space-y-2 mt-2">
              {draft.routeData?.routeDirections?.length ? (
                draft.routeData.routeDirections.map((segment) => (
                  <p
                    key={segment.id}
                    className="text-gray-800 flex items-center"
                  >
                    {segment.state === "land" ? (
                      <Truck className="w-5 h-5 mr-2 text-indigo-600" />
                    ) : segment.state === "sea" ? (
                      <Ship className="w-5 h-5 mr-2 text-indigo-600" />
                    ) : (
                      <Plane className="w-5 h-5 mr-2 text-indigo-600" />
                    )}
                    {segment.waypoints[0]} to {segment.waypoints[1]} (
                    {segment.state})
                  </p>
                ))
              ) : (
                <p className="text-gray-800">N/A</p>
              )}
            </div>
          </div>
        </div>

        {/* Route Map */}
        <div className="mt-8 bg-gray-50 p-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Route Map
          </h2>
          <MapView draftId={draftId} />
        </div>

        {/* Carbon Footprint */}
        <div className="p-6 sm:p-8">
          {carbonLoading ? (
            <div className="flex items-center justify-center mt-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              <p className="ml-3 text-gray-600 font-medium">
                Loading carbon data...
              </p>
            </div>
          ) : carbonData ? (
            <>
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">
                  Carbon Footprint Summary
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-gray-100 p-4 rounded-lg shadow-sm">
                    <p className="text-gray-600 text-sm">Total Distance</p>
                    <p className="text-lg font-bold">
                      {carbonData.totalDistance}
                    </p>
                  </div>
                  <div className="bg-gray-100 p-4 rounded-lg shadow-sm">
                    <p className="text-gray-600 text-sm">Total Emissions</p>
                    <p className="text-lg font-bold text-red-600">
                      {carbonData.totalEmissions}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">
                  Route Analysis
                </h3>
                <div className="space-y-4">
                  {carbonData.routeAnalysis.map((leg, idx) => (
                    <div
                      key={idx}
                      className="bg-gray-100 p-4 rounded-lg shadow-sm"
                    >
                      <p className="text-lg font-semibold text-teal-600">
                        {leg.leg}: {leg.origin} → {leg.destination}
                      </p>
                      <p className="text-gray-800">
                        <span className="font-medium">Mode:</span>{" "}
                        {leg.mode === "land" ? (
                          <Truck className="inline w-5 h-5 mr-1 text-indigo-600" />
                        ) : leg.mode === "sea" ? (
                          <Ship className="inline w-5 h-5 mr-1 text-indigo-600" />
                        ) : (
                          <Plane className="inline w-5 h-5 mr-1 text-indigo-600" />
                        )}
                        {leg.mode}
                      </p>
                      <p className="text-gray-800">
                        <span className="font-medium">Distance:</span>{" "}
                        {leg.distance}
                      </p>
                      <p className="text-gray-800">
                        <span className="font-medium">Emissions:</span>{" "}
                        <span className="text-red-600">{leg.emissions}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">
                  Suggestions
                </h3>
                <ul className="bg-gray-100 p-4 rounded-lg space-y-2 shadow-sm">
                  {carbonData.suggestions.map((suggestion, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-teal-600 rounded-full"></span>
                      <span className="text-gray-700">{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-4">
                  Environmental Impact
                </h3>
                <div className="bg-gray-100 p-6 rounded-lg text-center shadow-sm">
                  <p className="text-gray-800">{carbonData.earthImpact}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-gray-600 mt-8">
              Carbon footprint data is not available for this draft.
            </p>
          )}
        </div>

        {/* Footer */}
        <footer>
          <div className="bg-indigo-700 p-4 text-white text-center">
            <p className="text-sm">
              Report generated by TradePilot. Cargo is ready for shipment.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default ExportReport;
