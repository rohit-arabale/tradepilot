import React, { useEffect, useRef, useState } from "react";
import MapView from "./MapView";
import {
  Plus,
  Trash2,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageLead from "../../components/PageLead";
import { countryOptions } from "../../constants/constants";
import { trpc } from "../../lib/trpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Draft {
  _id: string;
  timestamp: string;
  formData?: {
    ShipmentDetails?: {
      "HS Code"?: string;
      "Product Description"?: string;
      "Origin Country"?: string;
      "Destination Country"?: string;
      "Gross Weight"?: string | number;
    };
  };
  statuses?: {
    compliance?: string;
    routeOptimization?: string;
  };
}

interface NewDraftForm {
  originCountry: string;
  destinationCountry: string;
  hsCode: string;
  productDescription: string;
  perishable: boolean;
  hazardous: boolean;
  weight: string;
}

interface FormErrors {
  originCountry?: string;
  destinationCountry?: string;
  hsCode?: string;
  productDescription?: string;
  weight?: string;
}

interface TabCounts {
  all: number;
  "yet-to-be-checked": number;
  "non-compliant": number;
  compliant: number;
  "ready-for-shipment": number;
}

// ---------------------------------------------------------------------------
// Small reusable primitives
// ---------------------------------------------------------------------------

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: "sm" | "md";
}

const Modal: React.FC<ModalProps> = ({ open, onClose, children, maxWidth = "sm" }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else {
      if (el.open) el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleClose = () => onClose();
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, [onClose]);

  const widthClass = maxWidth === "md" ? "max-w-2xl" : "max-w-lg";

  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => { if (e.target === dialogRef.current) onClose(); }}
      className={`w-full ${widthClass} mx-auto rounded-2xl bg-white shadow-sm border border-slate-200 p-0 backdrop:bg-black/50 open:flex open:flex-col`}
    >
      {children}
    </dialog>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const InventoryManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1024,
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [inventoryStatus, setInventoryStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [newDraft, setNewDraft] = useState<NewDraftForm>({
    originCountry: "",
    destinationCountry: "",
    hsCode: "",
    productDescription: "",
    perishable: false,
    hazardous: false,
    weight: "",
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false);
  const [deleteDraftId, setDeleteDraftId] = useState<string | null>(null);
  const [deleteEmail, setDeleteEmail] = useState<string>("");
  const [deleteEmailError, setDeleteEmailError] = useState<string>("");
  const [openExportDialog, setOpenExportDialog] = useState<boolean>(false);
  const [exportDraft, setExportDraft] = useState<Draft | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const navigate = useNavigate();

  // Fetch all tabs in parallel and combine
  const draftQueries = [
    trpc.inventory.getDrafts.useQuery({ tab: "yet-to-be-checked" }),
    trpc.inventory.getDrafts.useQuery({ tab: "compliant" }),
    trpc.inventory.getDrafts.useQuery({ tab: "non-compliant" }),
    trpc.inventory.getDrafts.useQuery({ tab: "ready-for-shipment" }),
  ];

  const loading = draftQueries.some((q) => q.isLoading);

  const allRawDrafts = draftQueries.flatMap((q) => {
    const data = q.data as { drafts?: Draft[] } | undefined;
    return data?.drafts ?? [];
  });

  const standardizedDrafts: Draft[] = allRawDrafts.map((draft) => ({
    ...draft,
    statuses: {
      ...draft.statuses,
      compliance:
        draft.statuses?.compliance === "Ready" ||
        draft.statuses?.compliance === "Compliant"
          ? "compliant"
          : draft.statuses?.compliance,
    },
  }));

  const uniqueDrafts: Draft[] = Array.from(
    new Map(standardizedDrafts.map((draft) => [draft._id.toString(), draft])).values()
  );

  const tabCounts: TabCounts = {
    all: uniqueDrafts.length,
    "yet-to-be-checked": 0,
    "non-compliant": 0,
    compliant: 0,
    "ready-for-shipment": 0,
  };

  uniqueDrafts.forEach((draft) => {
    const compliance = draft.statuses?.compliance;
    const routeOpt = draft.statuses?.routeOptimization;
    if (
      compliance === "notDone" &&
      (routeOpt === "notDone" || routeOpt === "done")
    ) {
      tabCounts["yet-to-be-checked"]++;
    } else if (compliance === "nonCompliant" && routeOpt === "notDone") {
      tabCounts["non-compliant"]++;
    } else if (compliance === "compliant" && routeOpt === "notDone") {
      tabCounts.compliant++;
    } else if (compliance === "compliant" && routeOpt === "done") {
      tabCounts["ready-for-shipment"]++;
    }
  });

  const createDraftMutation = trpc.inventory.createDraft.useMutation();
  const deleteDraftMutation = trpc.inventory.deleteDraft.useMutation();
  const utils = trpc.useUtils();

  const invalidateDrafts = () => {
    utils.inventory.getDrafts.invalidate();
  };

  const getFilteredDrafts = (): Draft[] => {
    let drafts = uniqueDrafts;

    if (activeTab !== "all") {
      drafts = drafts.filter((draft) => {
        const compliance = draft.statuses?.compliance;
        const routeOpt = draft.statuses?.routeOptimization;
        switch (activeTab) {
          case "yet-to-be-checked":
            return (
              compliance === "notDone" &&
              (routeOpt === "notDone" || routeOpt === "done")
            );
          case "non-compliant":
            return compliance === "nonCompliant" && routeOpt === "notDone";
          case "compliant":
            return compliance === "compliant" && routeOpt === "notDone";
          case "ready-for-shipment":
            return compliance === "compliant" && routeOpt === "done";
          default:
            return false;
        }
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      drafts = drafts.filter((draft) => {
        const sd = draft.formData?.ShipmentDetails;
        return (
          sd?.["HS Code"]?.toString().toLowerCase().includes(q) ||
          sd?.["Product Description"]?.toLowerCase().includes(q) ||
          sd?.["Origin Country"]?.toLowerCase().includes(q) ||
          sd?.["Destination Country"]?.toLowerCase().includes(q)
        );
      });
    }

    return drafts;
  };

  const handleActionClick = (draft: Draft) => {
    const compliance = draft.statuses?.compliance;
    const routeOpt = draft.statuses?.routeOptimization;
    if (compliance === "notDone" || compliance === "nonCompliant") {
      navigate(`/compliance?draftId=${draft._id}`);
    } else if (compliance === "compliant" && routeOpt === "notDone") {
      navigate(`/routes?draftId=${draft._id}`);
    }
  };

  const handleDeleteDraft = async (draftId: string): Promise<void> => {
    const draft = uniqueDrafts.find((d) => d._id === draftId);
    if (
      draft &&
      draft.statuses?.compliance === "compliant" &&
      draft.statuses?.routeOptimization === "done"
    ) {
      setDeleteDraftId(draftId);
      setOpenDeleteDialog(true);
      return;
    }

    await proceedWithDelete(draftId);
  };

  const proceedWithDelete = async (draftId: string): Promise<void> => {
    try {
      await deleteDraftMutation.mutateAsync({ id: draftId });
      setInventoryStatus({ kind: "ok", text: "Draft deleted." });
      invalidateDrafts();
    } catch (error: unknown) {
      console.error("Error deleting draft:", error);
      const errorMessage =
        (error as unknown as { message?: string })?.message || "Failed to delete draft.";
      setInventoryStatus({ kind: "err", text: errorMessage });
    }
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!deleteEmail || !emailRegex.test(deleteEmail)) {
      setDeleteEmailError("Please enter a valid email address.");
      return;
    }

    try {
      const result = await utils.auth.getMe.fetch();
      const userEmail = (result as unknown as { user?: { emailAddress?: string } })?.user?.emailAddress ?? "";

      if (deleteEmail.toLowerCase() !== userEmail.toLowerCase()) {
        setDeleteEmailError("The email does not match your account email.");
        return;
      }

      if (deleteDraftId) {
        await proceedWithDelete(deleteDraftId);
      }
      setOpenDeleteDialog(false);
      setDeleteDraftId(null);
      setDeleteEmail("");
      setDeleteEmailError("");
    } catch (error: unknown) {
      console.error("Error verifying email:", error);
      const errorMessage = (error as unknown as { message?: string })?.message || "Failed to verify email.";
      setDeleteEmailError(errorMessage);
    }
  };

  const handleDeleteCancel = () => {
    setOpenDeleteDialog(false);
    setDeleteDraftId(null);
    setDeleteEmail("");
    setDeleteEmailError("");
  };

  const handleDialogOpen = () => setOpenDialog(true);

  const handleDialogClose = () => {
    setOpenDialog(false);
    setNewDraft({
      originCountry: "",
      destinationCountry: "",
      hsCode: "",
      productDescription: "",
      perishable: false,
      hazardous: false,
      weight: "",
    });
    setFormErrors({});
    setSubmitting(false);
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const target = e.target as HTMLInputElement;
    const { name, value, type } = target;
    const checked = type === "checkbox" ? target.checked : undefined;
    setNewDraft((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setFormErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validateForm = (): FormErrors => {
    const errors: FormErrors = {};
    if (!newDraft.originCountry)
      errors.originCountry = "Origin Country is required";
    if (!newDraft.destinationCountry)
      errors.destinationCountry = "Destination Country is required";
    if (!newDraft.hsCode) errors.hsCode = "HS Code is required";
    if (!newDraft.productDescription)
      errors.productDescription = "Product Description is required";
    if (!newDraft.weight) errors.weight = "Weight is required";
    else if (isNaN(Number(newDraft.weight)) || Number(newDraft.weight) <= 0)
      errors.weight = "Weight must be a positive number";
    return errors;
  };

  const handleCreateDraft = async (): Promise<void> => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      await createDraftMutation.mutateAsync({
        originCountry: newDraft.originCountry,
        destinationCountry: newDraft.destinationCountry,
        hsCode: newDraft.hsCode,
        productDescription: newDraft.productDescription,
        perishable: newDraft.perishable,
        hazardous: newDraft.hazardous,
        weight: Number(newDraft.weight),
      });

      setInventoryStatus({ kind: "ok", text: "Draft created." });
      handleDialogClose();
      invalidateDrafts();
    } catch (error: unknown) {
      console.error("Error creating draft:", error);
      const errorMessage =
        (error as unknown as { message?: string })?.message || "Failed to create draft.";
      setInventoryStatus({ kind: "err", text: errorMessage });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusIcon = (
    compliance: string | undefined,
    routeOpt: string | undefined
  ): React.ReactElement => {
    if (compliance === "compliant" && routeOpt === "done") {
      return <Truck size={16} className="text-emerald-500 shrink-0" />;
    } else if (compliance === "compliant") {
      return <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />;
    } else if (compliance === "nonCompliant") {
      return <AlertTriangle size={16} className="text-red-600 shrink-0" />;
    } else {
      return <Clock size={16} className="text-amber-500 shrink-0" />;
    }
  };

  const getStatusChipClass = (
    compliance: string | undefined,
    routeOpt: string | undefined
  ): string => {
    if (compliance === "compliant" && routeOpt === "done") {
      return "bg-emerald-500 text-white";
    } else if (compliance === "compliant") {
      return "bg-emerald-600 text-white";
    } else if (compliance === "nonCompliant") {
      return "bg-red-600 text-white";
    } else {
      return "bg-amber-500 text-white";
    }
  };

  const getStatusLabel = (
    compliance: string | undefined,
    routeOpt: string | undefined
  ): string => {
    if (compliance === "compliant" && routeOpt === "done") return "Ready for Shipment";
    if (compliance === "compliant") return "Compliant";
    if (compliance === "nonCompliant") return "Non-compliant";
    return "Pending Review";
  };

  const tabs: { value: string; label: (wide: boolean) => string }[] = [
    { value: "all", label: () => `All (${tabCounts.all})` },
    {
      value: "yet-to-be-checked",
      label: (wide) =>
        wide
          ? `Yet to be Checked (${tabCounts["yet-to-be-checked"]})`
          : `Pending (${tabCounts["yet-to-be-checked"]})`,
    },
    { value: "non-compliant", label: () => `Non-compliant (${tabCounts["non-compliant"]})` },
    { value: "compliant", label: () => `Compliant (${tabCounts.compliant})` },
    {
      value: "ready-for-shipment",
      label: (wide) =>
        wide
          ? `Ready for Shipment (${tabCounts["ready-for-shipment"]})`
          : `Ready (${tabCounts["ready-for-shipment"]})`,
    },
  ];

  const isWide = viewportWidth >= 600;
  const filteredDrafts = getFilteredDrafts();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12">
      <PageLead
        title="Active shipment drafts"
        sub="Every shipment in flight. Filter by status, jump into a draft to verify, or export the manifest as a PDF."
        right={
          <input
            type="search"
            aria-label="Search drafts"
            placeholder="HS Code, product, country…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        }
      />

      <section>
        {/* Flat tab bar */}
        <div className="flex border-b border-slate-200 gap-6 pb-px overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-1 py-3 border-b-2 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${
                activeTab === tab.value
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {tab.label(isWide)}
            </button>
          ))}
        </div>

        <div className="mt-6" style={{ minHeight: 320 }}>
          {loading ? (
            <div className="space-y-0">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 py-4 border-b border-slate-100">
                  <div className="w-4 h-4 bg-slate-200 rounded-full shrink-0" />
                  <div className="flex-1 flex gap-6">
                    <div className="h-4 bg-slate-100 rounded w-20" />
                    <div className="h-4 bg-slate-100 rounded w-32" />
                    <div className="h-4 bg-slate-100 rounded w-24" />
                  </div>
                  <div className="h-4 bg-slate-100 rounded-full w-24" />
                </div>
              ))}
            </div>
          ) : filteredDrafts.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-slate-700 font-semibold text-lg mb-1">
                {activeTab === "non-compliant"
                  ? "No non-compliant drafts"
                  : activeTab === "compliant"
                  ? "No compliant drafts yet"
                  : activeTab === "ready-for-shipment"
                  ? "Nothing ready for shipment yet"
                  : "No drafts available"}
              </p>
              <p className="text-sm text-slate-500 mb-6">
                {activeTab === "yet-to-be-checked"
                  ? "Create your first draft to get started!"
                  : activeTab === "non-compliant"
                  ? "Great job — no compliance issues found."
                  : activeTab === "compliant"
                  ? "Once a draft passes compliance, it will appear here."
                  : activeTab === "ready-for-shipment"
                  ? "Compliant drafts with an optimized route will appear here."
                  : "No drafts match this category."}
              </p>
              {activeTab !== "yet-to-be-checked" && (
                <button
                  onClick={() => setActiveTab("yet-to-be-checked")}
                  className="px-5 py-3 border border-gray-200 hover:bg-gray-50 text-gray-900 text-sm font-semibold rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
                >
                  View pending drafts
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <th className="px-4 py-3 text-left w-8">#</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">HS Code</th>
                    <th className="px-4 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-left hidden sm:table-cell">Origin</th>
                    <th className="px-4 py-3 text-left hidden sm:table-cell">Destination</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrafts.map((draft, index) => {
                    const compliance = draft.statuses?.compliance;
                    const routeOpt = draft.statuses?.routeOptimization;
                    const sd = draft.formData?.ShipmentDetails;
                    const isExpanded = expandedDraftId === draft._id;
                    return (
                      <React.Fragment key={draft._id}>
                        <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-400 font-medium">{index + 1}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusChipClass(compliance, routeOpt)}`}>
                              {getStatusIcon(compliance, routeOpt)}
                              {getStatusLabel(compliance, routeOpt)}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-700 text-xs">
                            {sd?.["HS Code"] || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-900 max-w-[200px] truncate">
                            {sd?.["Product Description"] || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                            {sd?.["Origin Country"] || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                            {sd?.["Destination Country"] || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                            {new Date(draft.timestamp).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {!(compliance === "compliant" && routeOpt === "done") && (
                                <button
                                  onClick={() => handleActionClick(draft)}
                                  className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                                >
                                  {compliance === "compliant" && routeOpt === "notDone"
                                    ? "Optimize Route"
                                    : "Check Compliance"}
                                </button>
                              )}
                              {compliance === "compliant" && routeOpt === "done" && (
                                <button
                                  onClick={() => {
                                    setExportDraft(draft);
                                    setOpenExportDialog(true);
                                  }}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                                >
                                  Export Report
                                </button>
                              )}
                              <button
                                onClick={() =>
                                  setExpandedDraftId(isExpanded ? null : draft._id)
                                }
                                aria-expanded={isExpanded}
                                aria-controls={`map-peek-${draft._id}`}
                                className="px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-900 text-xs font-semibold rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
                              >
                                {isExpanded ? "Hide map" : "Map"}
                              </button>
                              <button
                                onClick={() => handleDeleteDraft(draft._id)}
                                aria-label={`Delete draft ${index + 1}`}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {/* Map peek row */}
                        <tr
                          id={`map-peek-${draft._id}`}
                          style={{ display: isExpanded ? "table-row" : "none" }}
                        >
                          <td colSpan={8} className="px-4 pb-4">
                            <div
                              style={{
                                height: "20rem",
                                borderRadius: "8px",
                                overflow: "hidden",
                                border: "1px solid #e2e8f0",
                              }}
                            >
                              <MapView draftId={String(draft._id)} />
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {activeTab === "yet-to-be-checked" && (
        <button
          onClick={handleDialogOpen}
          aria-label="Create new draft"
          className="fixed bottom-4 sm:bottom-6 left-4 sm:left-6 w-12 sm:w-16 h-12 sm:h-16 rounded-full bg-gray-900 hover:bg-gray-800 text-white shadow-sm flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <Plus size={24} className="sm:w-7 sm:h-7" />
        </button>
      )}

      {/* Export Report Dialog */}
      <Modal open={openExportDialog} onClose={() => setOpenExportDialog(false)} maxWidth="sm">
        <div className="px-6 pt-6 pb-4 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">Shipment Manifest Report</h2>
        </div>
        <div className="px-6 py-6 flex flex-col gap-5">
          {exportDraft && (() => {
            const sd = exportDraft.formData?.ShipmentDetails;
            return (
              <>
                {/* Meta block qualifies as a result panel — mono text, returned data */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono text-xs text-slate-600 space-y-0.5">
                  <p><strong>Draft ID:</strong> {exportDraft._id}</p>
                  <p><strong>Created:</strong> {new Date(exportDraft.timestamp).toLocaleString()}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">Origin</p>
                    <p className="font-semibold text-slate-900 text-sm">{sd?.["Origin Country"] || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">Destination</p>
                    <p className="font-semibold text-slate-900 text-sm">{sd?.["Destination Country"] || "N/A"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">Weight</p>
                    <p className="font-semibold text-slate-900 text-sm">{sd?.["Gross Weight"] != null ? `${sd["Gross Weight"]} kg` : "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">HS Code</p>
                    <p className="font-semibold text-slate-900 text-sm font-mono">{sd?.["HS Code"] || "N/A"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">Cargo Description</p>
                  <p className="text-slate-900 text-sm">{sd?.["Product Description"] || "N/A"}</p>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Regulatory Review</span>
                  <span className="text-xs font-semibold text-emerald-700 uppercase">Approved &amp; Compliant</span>
                </div>
              </>
            );
          })()}
        </div>
        <div className="px-6 pb-6 flex justify-center gap-3 flex-wrap">
          <button
            onClick={() => {
              if (!exportDraft) return;
              const sd = exportDraft.formData?.ShipmentDetails;
              const reportPayload = {
                draftId: exportDraft._id,
                created: exportDraft.timestamp,
                origin: sd?.["Origin Country"] ?? "N/A",
                destination: sd?.["Destination Country"] ?? "N/A",
                hsCode: sd?.["HS Code"] ?? "N/A",
                grossWeight: sd?.["Gross Weight"] ?? "N/A",
                productDescription: sd?.["Product Description"] ?? "N/A",
                complianceStatus: "Approved & Compliant",
                statuses: exportDraft.statuses,
              };
              const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reportPayload, null, 2));
              const downloadAnchor = document.createElement("a");
              downloadAnchor.setAttribute("href", dataStr);
              downloadAnchor.setAttribute("download", `shipment-report-${exportDraft._id}.json`);
              document.body.appendChild(downloadAnchor);
              downloadAnchor.click();
              downloadAnchor.remove();
            }}
            className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            Download JSON
          </button>
          <button
            onClick={() => window.print()}
            className="px-5 py-3 border border-gray-200 hover:bg-gray-50 text-gray-900 text-sm font-semibold rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            Print Manifest
          </button>
          <button
            onClick={() => setOpenExportDialog(false)}
            className="px-5 py-3 text-slate-500 text-sm font-semibold rounded-lg hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            Close
          </button>
        </div>
      </Modal>

      {/* Delete Dialog */}
      <Modal open={openDeleteDialog} onClose={handleDeleteCancel} maxWidth="sm">
        <div className="px-6 pt-6 pb-4 border-b border-slate-200">
          <h2 className="text-xl font-bold text-red-600">Warning: Deleting Draft</h2>
        </div>
        <div className="px-6 py-6 space-y-4">
          <p className="text-slate-700 text-sm">
            This choice may negatively affect your sustainability rating and
            disrupt overall analysis records.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Enter your email to proceed
            </label>
            <input
              type="email"
              value={deleteEmail}
              onChange={(e) => {
                setDeleteEmail(e.target.value);
                setDeleteEmailError("");
              }}
              placeholder="Email"
              className={`w-full px-4 py-3 border rounded-lg text-base text-slate-800 focus:outline-none focus:ring-2 focus:border-transparent ${
                deleteEmailError
                  ? "border-red-500 focus:ring-red-500"
                  : "border-slate-300 focus:ring-blue-500 focus:border-blue-500"
              }`}
            />
            {deleteEmailError && (
              <p className="text-red-600 text-xs mt-1">{deleteEmailError}</p>
            )}
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-between gap-3">
          <button
            onClick={handleDeleteCancel}
            className="px-5 py-3 border border-gray-200 hover:bg-gray-50 text-gray-900 text-sm font-semibold rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteConfirm}
            className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
          >
            Delete
          </button>
        </div>
      </Modal>

      {/* Create Draft Dialog */}
      <Modal open={openDialog} onClose={handleDialogClose} maxWidth="md">
        <div className="px-6 pt-6 pb-4 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">Create New Draft</h2>
        </div>
        <div className="px-6 py-6 overflow-y-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateDraft();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Origin Country</label>
                <select
                  name="originCountry"
                  value={newDraft.originCountry}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
                >
                  <option value="" disabled>Select Origin Country</option>
                  {countryOptions.map((option: { value: string; label: string }) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="text-red-600 text-xs mt-1 min-h-[1.2em]">{formErrors.originCountry || ""}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Destination Country</label>
                <select
                  name="destinationCountry"
                  value={newDraft.destinationCountry}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
                >
                  <option value="" disabled>Select Destination</option>
                  {countryOptions.map((option: { value: string; label: string }) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="text-red-600 text-xs mt-1 min-h-[1.2em]">{formErrors.destinationCountry || ""}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="hsCode" className="block text-sm font-medium text-slate-700 mb-1.5">HS Code</label>
                <input
                  type="text"
                  id="hsCode"
                  name="hsCode"
                  value={newDraft.hsCode}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g. 8471.30"
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-red-600 text-xs mt-1 min-h-[1.2em]">{formErrors.hsCode || ""}</p>
              </div>

              <div>
                <label htmlFor="weight" className="block text-sm font-medium text-slate-700 mb-1.5">Weight (kg)</label>
                <input
                  type="number"
                  id="weight"
                  name="weight"
                  value={newDraft.weight}
                  onChange={handleInputChange}
                  required
                  min="0"
                  step="0.1"
                  placeholder="e.g. 500"
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-red-600 text-xs mt-1 min-h-[1.2em]">{formErrors.weight || ""}</p>
              </div>
            </div>

            <div>
              <label htmlFor="productDescription" className="block text-sm font-medium text-slate-700 mb-1.5">
                Product Description
              </label>
              <textarea
                id="productDescription"
                name="productDescription"
                value={newDraft.productDescription}
                onChange={handleInputChange}
                required
                placeholder="Describe the product (e.g. Electronic components for assembly)"
                rows={3}
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-red-600 text-xs mt-1 min-h-[1.2em]">{formErrors.productDescription || ""}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="perishable"
                  checked={newDraft.perishable}
                  onChange={handleInputChange}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">Perishable</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="hazardous"
                  checked={newDraft.hazardous}
                  onChange={handleInputChange}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">Hazardous</span>
              </label>
            </div>

            <div className="pt-4 flex justify-center">
              <button
                type="submit"
                disabled={submitting}
                className="px-8 py-3 bg-gray-900 hover:bg-gray-800 disabled:bg-slate-400 text-white text-sm font-semibold rounded-lg shadow-sm disabled:cursor-not-allowed min-w-[180px] focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
              >
                <span className="flex items-center justify-center gap-3">
                  {submitting ? "Creating..." : "Create Draft"}
                  {submitting && (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                </span>
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {inventoryStatus && (
        <div
          role={inventoryStatus.kind === "err" ? "alert" : "status"}
          className={`fixed bottom-6 right-6 max-w-md p-3 rounded-xl border text-sm flex items-center gap-2 shadow-sm ${
            inventoryStatus.kind === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {inventoryStatus.kind === "ok" ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          )}
          {inventoryStatus.text}
          <button
            type="button"
            onClick={() => setInventoryStatus(null)}
            className="ml-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default InventoryManagement;
