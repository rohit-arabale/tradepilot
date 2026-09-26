import React, { useState, useEffect } from "react";
import { Info } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import ComplianceResponse from "./ComplianceResponse";
import ComplianceResponseSkeleton from "../../components/Skeleton/ComplianceResponseSkeleton";
import {
  initialFormData,
  formStructure,
  tabOrder,
  countryOptions,
  incotermsOptions,
  currencyOptions,
  booleanOptions,
  transportOptions,
} from "../../constants/constants";
import NewsContextCard from "../../components/NewsContextCard";
import { trpc } from "../../lib/trpc";

type FormData = typeof initialFormData;

const SESSION_KEY = "compliance-form-draft";

const ComplianceForm: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Restore form state from sessionStorage to survive accidental tab switches
  const [formData, setFormData] = useState<FormData>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) return JSON.parse(saved) as FormData;
    } catch {}
    return initialFormData;
  });
  const [activeTab, setActiveTab] = useState<string>("ShipmentDetails");
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<Record<string, unknown> | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [responseReceived, setResponseReceived] = useState<boolean>(false);
  const [draftIdToFetch, setDraftIdToFetch] = useState<string | null>(null);

  const isButtonDisabled = loading || responseReceived;

  // Persist form state to sessionStorage so tab switches don't lose data
  useEffect(() => {
    if (!responseReceived) {
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(formData));
      } catch {}
    } else {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {}
    }
  }, [formData, responseReceived]);

  // tRPC query to fetch draft by ID (enabled only when draftIdToFetch is set)
  const { data: draftData, isError: isDraftError, error: draftError } = trpc.inventory.getDraftById.useQuery(
    { id: draftIdToFetch ?? "" },
    {
      enabled: !!draftIdToFetch,
      retry: false,
    }
  );

  // tRPC mutation for compliance check
  const complianceCheckMutation = trpc.compliance.check.useMutation({
    onSuccess: (data) => {
      setResponse(data as unknown as Record<string, unknown>);
      setResponseReceived(true);
      setLoading(false);
    },
    onError: (error) => {
      console.error("Error submitting compliance check:", error);
      setResponse({
        message: error.message || "Failed to submit compliance check",
      });
      setLoading(false);
    },
  });

  // Handle draft fetch result
  useEffect(() => {
    if (draftData) {
      const draft = draftData.draft as unknown as Record<string, unknown> & {
        formData?: Record<string, unknown>;
      };
      if (!draft || !draft.formData) {
        setStatusMessage("Invalid draft data received");
        navigate("/inventory");
        return;
      }

      const draftFormData = draft.formData as Partial<FormData>;

      const updatedFormData: FormData = {
        ...initialFormData,
        ShipmentDetails: {
          ...initialFormData.ShipmentDetails,
          "Origin Country":
            (draftFormData.ShipmentDetails?.["Origin Country"] as string) || "",
          "Destination Country":
            (draftFormData.ShipmentDetails?.["Destination Country"] as string) || "",
          "HS Code": (draftFormData.ShipmentDetails?.["HS Code"] as string) || "",
          "Product Description":
            (draftFormData.ShipmentDetails?.["Product Description"] as string) || "",
          Quantity: draftFormData.ShipmentDetails?.Quantity
            ? String(draftFormData.ShipmentDetails.Quantity)
            : "",
          "Gross Weight": draftFormData.ShipmentDetails?.["Gross Weight"]
            ? String(draftFormData.ShipmentDetails["Gross Weight"])
            : "",
        },
        TradeAndRegulatoryDetails: {
          ...initialFormData.TradeAndRegulatoryDetails,
          "Incoterms 2020":
            (draftFormData.TradeAndRegulatoryDetails?.["Incoterms 2020"] as string) || "",
          "Declared Value": {
            currency:
              ((draftFormData.TradeAndRegulatoryDetails?.["Declared Value"] as Record<string, string>)?.currency) || "",
            amount:
              ((draftFormData.TradeAndRegulatoryDetails?.["Declared Value"] as Record<string, string>)?.amount) || "",
          },
          "Currency of Transaction":
            (draftFormData.TradeAndRegulatoryDetails?.["Currency of Transaction"] as string) || "",
          "Trade Agreement Claimed":
            (draftFormData.TradeAndRegulatoryDetails?.["Trade Agreement Claimed"] as string) || "",
          "Dual-Use Goods":
            (draftFormData.TradeAndRegulatoryDetails?.["Dual-Use Goods"] as string) || "No",
          "Hazardous Material":
            (draftFormData.TradeAndRegulatoryDetails?.["Hazardous Material"] as string) || "No",
          Perishable:
            (draftFormData.TradeAndRegulatoryDetails?.["Perishable"] as string) || "No",
        },
        PartiesAndIdentifiers: {
          ...initialFormData.PartiesAndIdentifiers,
          "Shipper/Exporter":
            (draftFormData.PartiesAndIdentifiers?.["Shipper/Exporter"] as string) || "",
          "Consignee/Importer":
            (draftFormData.PartiesAndIdentifiers?.["Consignee/Importer"] as string) || "",
          "Manufacturer Information":
            (draftFormData.PartiesAndIdentifiers?.["Manufacturer Information"] as string) || "",
          "EORI/Tax ID":
            (draftFormData.PartiesAndIdentifiers?.["EORI/Tax ID"] as string) || "",
        },
        LogisticsAndHandling: {
          ...initialFormData.LogisticsAndHandling,
          "Means of Transport":
            (draftFormData.LogisticsAndHandling?.["Means of Transport"] as string) || "",
          "Port of Loading":
            (draftFormData.LogisticsAndHandling?.["Port of Loading"] as string) || "",
          "Port of Discharge":
            (draftFormData.LogisticsAndHandling?.["Port of Discharge"] as string) || "",
          "Special Handling":
            (draftFormData.LogisticsAndHandling?.["Special Handling"] as string) || "",
          "Temperature Requirements":
            (draftFormData.LogisticsAndHandling?.["Temperature Requirements"] as string) || "",
        },
        DocumentVerification: {
          ...initialFormData.DocumentVerification,
          "Commercial Invoice": {
            checked:
              ((draftFormData.DocumentVerification?.["Commercial Invoice"] as Record<string, unknown>)?.checked as boolean) || false,
            subItems: {
              "Invoice number present":
                (((draftFormData.DocumentVerification?.["Commercial Invoice"] as Record<string, unknown>)?.subItems as Record<string, boolean>)?.["Invoice number present"]) || false,
              "Details match shipment":
                (((draftFormData.DocumentVerification?.["Commercial Invoice"] as Record<string, unknown>)?.subItems as Record<string, boolean>)?.["Details match shipment"]) || false,
              "Customs compliant":
                (((draftFormData.DocumentVerification?.["Commercial Invoice"] as Record<string, unknown>)?.subItems as Record<string, boolean>)?.["Customs compliant"]) || false,
            },
          },
          "Packing List": {
            checked:
              ((draftFormData.DocumentVerification?.["Packing List"] as Record<string, unknown>)?.checked as boolean) || false,
            subItems: {
              "Contents accurate":
                (((draftFormData.DocumentVerification?.["Packing List"] as Record<string, unknown>)?.subItems as Record<string, boolean>)?.["Contents accurate"]) || false,
              "Quantities match":
                (((draftFormData.DocumentVerification?.["Packing List"] as Record<string, unknown>)?.subItems as Record<string, boolean>)?.["Quantities match"]) || false,
              "Matches invoice":
                (((draftFormData.DocumentVerification?.["Packing List"] as Record<string, unknown>)?.subItems as Record<string, boolean>)?.["Matches invoice"]) || false,
            },
          },
          "Certificate of Origin": {
            checked:
              ((draftFormData.DocumentVerification?.["Certificate of Origin"] as Record<string, unknown>)?.checked as boolean) || false,
            subItems: {
              "Origin verified":
                (((draftFormData.DocumentVerification?.["Certificate of Origin"] as Record<string, unknown>)?.subItems as Record<string, boolean>)?.["Origin verified"]) || false,
              "Trade agreement compliant":
                (((draftFormData.DocumentVerification?.["Certificate of Origin"] as Record<string, unknown>)?.subItems as Record<string, boolean>)?.["Trade agreement compliant"]) || false,
            },
          },
          "Licenses/Permits": {
            checked:
              ((draftFormData.DocumentVerification?.["Licenses/Permits"] as Record<string, unknown>)?.checked as boolean) || false,
            subItems: {
              "Valid number":
                (((draftFormData.DocumentVerification?.["Licenses/Permits"] as Record<string, unknown>)?.subItems as Record<string, boolean>)?.["Valid number"]) || false,
              "Not expired":
                (((draftFormData.DocumentVerification?.["Licenses/Permits"] as Record<string, unknown>)?.subItems as Record<string, boolean>)?.["Not expired"]) || false,
              "Authority verified":
                (((draftFormData.DocumentVerification?.["Licenses/Permits"] as Record<string, unknown>)?.subItems as Record<string, boolean>)?.["Authority verified"]) || false,
            },
          },
          "Bill of Lading": {
            checked:
              ((draftFormData.DocumentVerification?.["Bill of Lading"] as Record<string, unknown>)?.checked as boolean) || false,
            subItems: {
              "Accurate details":
                (((draftFormData.DocumentVerification?.["Bill of Lading"] as Record<string, unknown>)?.subItems as Record<string, boolean>)?.["Accurate details"]) || false,
              "Shipping regulations compliant":
                (((draftFormData.DocumentVerification?.["Bill of Lading"] as Record<string, unknown>)?.subItems as Record<string, boolean>)?.["Shipping regulations compliant"]) || false,
            },
          },
        },
        IntendedUseDetails: {
          ...initialFormData.IntendedUseDetails,
          "Intended Use":
            (draftFormData.IntendedUseDetails?.["Intended Use"] as string) || "",
        },
      };

      setFormData(updatedFormData);
      setLoading(false);
    }
  }, [draftData, navigate]);

  // Handle draft fetch error
  useEffect(() => {
    if (isDraftError && draftError) {
      console.error("Error fetching draft:", draftError);
      setStatusMessage(draftError.message || "Failed to fetch draft.");
      navigate("/inventory");
      setLoading(false);
    }
  }, [isDraftError, draftError, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const draftId = params.get("draftId");
    if (draftId) {
      setLoading(true);
      setDraftIdToFetch(draftId);
    }
  }, [location]);

  const areCurrentTabMandatoryFieldsFilled = (): boolean => {
    for (const fieldData of (formStructure as Record<string, typeof formStructure[keyof typeof formStructure]>)[activeTab]) {
      if (fieldData.mandatory) {
        if (activeTab === "DocumentVerification") {
          const doc = (formData.DocumentVerification as Record<string, { checked: boolean; subItems: Record<string, boolean> }>)[fieldData.field];
          if (!Object.values(doc.subItems).every((item) => item)) {
            return false;
          }
        } else {
          const section = formData[activeTab as keyof FormData] as Record<string, unknown>;
          const value = section[fieldData.field];
          if (
            fieldData.option_type ===
            "Text input (Currency) & Number input (Amount)"
          ) {
            const valObj = value as { currency?: string; amount?: string };
            if (!valObj?.currency || !valObj?.amount) return false;
          } else if (!value) {
            return false;
          }
        }
      }
    }
    return true;
  };

  const handleInputChange = (
    section: string,
    field: string,
    value: unknown,
    subField: string | null = null
  ): void => {
    if (responseReceived) return;
    setFormData((prev) => {
      const updatedSection = { ...(prev[section as keyof FormData] as Record<string, unknown>) };
      if (subField) {
        updatedSection[field] = {
          ...(updatedSection[field] as Record<string, unknown>),
          [subField]: value,
        };
      } else {
        updatedSection[field] = value;
      }
      return { ...prev, [section]: updatedSection };
    });
  };

  const handleDocChange = (docName: string, checked: boolean): void => {
    if (responseReceived) return;
    setFormData((prev) => ({
      ...prev,
      DocumentVerification: {
        ...prev.DocumentVerification,
        [docName]: {
          ...(prev.DocumentVerification as Record<string, unknown>)[docName] as Record<string, unknown>,
          checked,
        },
      },
    }));
  };

  const handleSubItemChange = (
    docName: string,
    subItem: string,
    checked: boolean
  ): void => {
    if (responseReceived) return;
    // Read prev inside the updater so rapid checkbox clicks can't be lost to
    // a stale snapshot of formData (race condition that previously dropped
    // sub-item toggles when toggling several boxes quickly).
    setFormData((prev) => {
      const prevDocVer = prev.DocumentVerification as Record<
        string,
        { checked: boolean; subItems: Record<string, boolean> }
      >;
      return {
        ...prev,
        DocumentVerification: {
          ...prev.DocumentVerification,
          [docName]: {
            ...prevDocVer[docName],
            subItems: {
              ...prevDocVer[docName].subItems,
              [subItem]: checked,
            },
          },
        },
      };
    });
  };

  const handleNextTab = (): void => {
    if (responseReceived) return;
    const currentIndex = tabOrder.indexOf(activeTab);
    if (currentIndex < tabOrder.length - 1) {
      setActiveTab(tabOrder[currentIndex + 1]);
    }
  };

  const handlePrevTab = (): void => {
    if (responseReceived) return;
    const currentIndex = tabOrder.indexOf(activeTab);
    if (currentIndex > 0) {
      setActiveTab(tabOrder[currentIndex - 1]);
    }
  };

  const handleSubmit = (): void => {
    if (responseReceived) return;
    setLoading(true);

    const params = new URLSearchParams(location.search);
    const draftId = params.get("draftId") ?? undefined;

    complianceCheckMutation.mutate({
      draftId,
      ShipmentDetails: formData.ShipmentDetails as Record<string, unknown>,
      TradeAndRegulatoryDetails: formData.TradeAndRegulatoryDetails as Record<string, unknown>,
      PartiesAndIdentifiers: formData.PartiesAndIdentifiers as Record<string, unknown>,
      LogisticsAndHandling: formData.LogisticsAndHandling as Record<string, unknown>,
      DocumentVerification: formData.DocumentVerification as Record<string, unknown>,
      IntendedUseDetails: formData.IntendedUseDetails as Record<string, unknown>,
    });
  };

  const renderInput = (section: string, fieldData: {
    field: string;
    option_type: string;
    mandatory: boolean;
    placeholder?: string;
    sub_items?: Array<{ field: string; why_checked: string }>;
    why_checked?: string;
  }): React.ReactNode => {
    const { field, option_type, mandatory, placeholder } = fieldData;
    const sectionData = formData[section as keyof FormData] as Record<string, unknown>;
    const value = sectionData[field];

    switch (option_type) {
      case "Dropdown (ISO 3166-1 alpha-2)":
        return (
          <select
            value={(value as string) || ""}
            onChange={(e) => handleInputChange(section, field, e.target.value)}
            className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm md:text-base ${
              mandatory && !value ? "border-red-500" : "border-slate-300"
            } ${responseReceived ? "bg-slate-100 cursor-not-allowed" : ""}`}
            required={mandatory}
            disabled={responseReceived}
          >
            <option value="" disabled>
              Select
            </option>
            {countryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case "Dropdown":
      case "Dropdown (Yes/No)": {
        const options =
          field === "Incoterms 2020"
            ? incotermsOptions
            : field === "Currency of Transaction"
            ? currencyOptions
            : field === "Means of Transport"
            ? transportOptions
            : booleanOptions;
        return (
          <select
            value={(value as string) || ""}
            onChange={(e) => handleInputChange(section, field, e.target.value)}
            className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm md:text-base ${
              mandatory && !value ? "border-red-500" : "border-slate-300"
            } ${responseReceived ? "bg-slate-100 cursor-not-allowed" : ""}`}
            required={mandatory}
            disabled={responseReceived}
          >
            <option value="" disabled>
              Select
            </option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      }

      case "Number input":
        return (
          <input
            type="number"
            value={(value as string) || ""}
            onChange={(e) => handleInputChange(section, field, e.target.value)}
            className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm md:text-base ${
              mandatory && !value ? "border-red-500" : "border-slate-300"
            } ${responseReceived ? "bg-slate-100 cursor-not-allowed" : ""}`}
            placeholder={placeholder}
            required={mandatory}
            min="0"
            disabled={responseReceived}
          />
        );

      case "Text input":
      case "Text area":
        return option_type === "Text area" ? (
          <textarea
            value={(value as string) || ""}
            onChange={(e) => handleInputChange(section, field, e.target.value)}
            className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm md:text-base ${
              mandatory && !value ? "border-red-500" : "border-slate-300"
            } ${responseReceived ? "bg-slate-100 cursor-not-allowed" : ""}`}
            placeholder={placeholder}
            rows={3}
            required={mandatory}
            disabled={responseReceived}
          />
        ) : (
          <input
            type="text"
            value={(value as string) || ""}
            onChange={(e) => handleInputChange(section, field, e.target.value)}
            className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm md:text-base ${
              mandatory && !value ? "border-red-500" : "border-slate-300"
            } ${responseReceived ? "bg-slate-100 cursor-not-allowed" : ""}`}
            placeholder={placeholder}
            required={mandatory}
            disabled={responseReceived}
          />
        );

      case "Text input (Currency) & Number input (Amount)": {
        const valObj = value as { currency?: string; amount?: string } | undefined;
        return (
          <div className="flex flex-col md:flex-row gap-4">
            <select
              value={valObj?.currency || ""}
              onChange={(e) =>
                handleInputChange(section, field, e.target.value, "currency")
              }
              className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm md:text-base ${
                mandatory && !valObj?.currency
                  ? "border-red-500"
                  : "border-slate-300"
              } ${responseReceived ? "bg-slate-100 cursor-not-allowed" : ""}`}
              required={mandatory}
              disabled={responseReceived}
            >
              <option value="" disabled>
                Select
              </option>
              {currencyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={valObj?.amount || ""}
              onChange={(e) =>
                handleInputChange(section, field, e.target.value, "amount")
              }
              className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm md:text-base ${
                mandatory && !valObj?.amount
                  ? "border-red-500"
                  : "border-slate-300"
              } ${responseReceived ? "bg-slate-100 cursor-not-allowed" : ""}`}
              placeholder={placeholder}
              required={mandatory}
              min="0"
              disabled={responseReceived}
            />
          </div>
        );
      }

      case "Checkbox": {
        const docVer = formData.DocumentVerification as Record<
          string,
          { checked: boolean; subItems: Record<string, boolean> }
        >;
        const doc = docVer[field];
        return (
          <div>
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={doc.checked || fieldData.mandatory}
                onChange={(e) =>
                  !fieldData.mandatory &&
                  handleDocChange(field, e.target.checked)
                }
                disabled={fieldData.mandatory || responseReceived}
                className={`mr-2 ${
                  responseReceived ? "cursor-not-allowed opacity-50" : ""
                }`}
              />
              <span className="text-sm md:text-base text-slate-700">
                {field}
              </span>
            </div>
            {(doc.checked || fieldData.mandatory) && (
              <div className="ml-6 mt-2 space-y-2">
                {(fieldData.sub_items ?? []).map((subItem) => (
                  <div key={subItem.field} className="flex items-center">
                    <span title={subItem.why_checked}>
                      <Info size={16} className="text-blue-500 mr-2 cursor-default" />
                    </span>
                    <input
                      type="checkbox"
                      checked={doc.subItems[subItem.field]}
                      onChange={(e) =>
                        handleSubItemChange(
                          field,
                          subItem.field,
                          e.target.checked
                        )
                      }
                      className={`mr-2 ${
                        responseReceived ? "cursor-not-allowed opacity-50" : ""
                      }`}
                      disabled={responseReceived}
                    />
                    <span className="text-sm md:text-base text-slate-700">
                      {subItem.field}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto bg-white mt-6 border border-slate-200 rounded-xl mb-6 overflow-x-auto">
        <div className="flex border-b border-slate-200 whitespace-nowrap bg-slate-50">
          {tabOrder.map((tab: string, tabIdx: number) => {
            const currentIdx = tabOrder.indexOf(activeTab);
            // Allow free navigation to already-visited tabs, but only allow
            // forward jumps if every tab in between has its mandatory fields
            // filled. This prevents step-skipping via the tab buttons (the
            // arrow-key skip equivalent).
            const isFutureTab = tabIdx > currentIdx;
            const isLocked =
              responseReceived ||
              (isFutureTab && !areCurrentTabMandatoryFieldsFilled());
            return (
              <button
                key={tab}
                onClick={() => {
                  if (!isLocked) setActiveTab(tab);
                }}
                aria-disabled={isLocked}
                disabled={isLocked}
                className={`flex-shrink-0 px-6 py-4 text-sm sm:text-base font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 relative ${
                  activeTab === tab
                    ? "text-blue-600 bg-white"
                    : isLocked
                    ? "text-slate-400 cursor-not-allowed"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                {tab.replace(/([A-Z])/g, " $1").trim()}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="max-w-7xl mx-auto bg-white rounded-xl p-6 sm:p-8 border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
            {activeTab.replace(/([A-Z])/g, " $1").trim()}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:gap-6">
          {((formStructure as Record<string, typeof formStructure[keyof typeof formStructure]>)[activeTab]).map((fieldData: {
            field: string;
            option_type: string;
            mandatory: boolean;
            placeholder?: string;
            sub_items?: Array<{ field: string; why_checked: string }>;
            why_checked?: string;
          }) => (
            <div key={fieldData.field} className="flex flex-col">
              <div className="flex items-center mb-2">
                <span title={fieldData.why_checked}>
                  <Info size={16} className="text-blue-500 mr-2 cursor-default" />
                </span>
                <label
                  htmlFor={`field-${activeTab}-${fieldData.field}`}
                  className="text-sm font-medium text-slate-600"
                >
                  {fieldData.field}{" "}
                  {fieldData.mandatory && (
                    <span className="text-red-500" aria-label="required">*</span>
                  )}
                </label>
              </div>
              {renderInput(activeTab, fieldData)}
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row justify-between mt-4 sm:mt-6 gap-4">
          <button
            onClick={handlePrevTab}
            disabled={tabOrder.indexOf(activeTab) === 0 || responseReceived}
            className={`py-2.5 px-6 text-sm font-semibold rounded-xl w-full sm:w-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
              tabOrder.indexOf(activeTab) === 0 || responseReceived
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-emerald-500 hover:bg-emerald-600 text-white"
            }`}
          >
            Previous
          </button>
          {activeTab !== "IntendedUseDetails" ? (
            <button
              onClick={handleNextTab}
              disabled={
                !areCurrentTabMandatoryFieldsFilled() || responseReceived
              }
              className={`py-2.5 px-6 text-sm font-semibold rounded-xl w-full sm:w-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 ${
                !areCurrentTabMandatoryFieldsFilled() || responseReceived
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-gray-900 hover:bg-gray-800 text-white"
              }`}
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isButtonDisabled}
              className={`py-2.5 px-6 text-sm font-semibold rounded-xl w-full sm:w-auto min-w-[200px] focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 inline-flex items-center justify-center gap-2 ${
                isButtonDisabled
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-gray-900 hover:bg-gray-800 text-white"
              }`}
            >
              {loading && (
                <svg
                  className="w-4 h-4 flex-shrink-0"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {loading
                ? "Checking..."
                : responseReceived
                ? "Compliance Checked"
                : "Run Compliance Check"}
            </button>
          )}
        </div>
      </div>
      <div className="min-h-[400px] space-y-6">
        {statusMessage && (
          <p className="text-sm text-red-600" role="alert">
            {statusMessage}
          </p>
        )}
        {loading ? (
          <ComplianceResponseSkeleton />
        ) : response ? (
          <>
            <NewsContextCard
              surface="compliance"
              origin={formData.ShipmentDetails["Origin Country"]}
              destination={formData.ShipmentDetails["Destination Country"]}
              hsCode={formData.ShipmentDetails["HS Code"]}
              productDescription={formData.ShipmentDetails["Product Description"]}
              transportMode={formData.LogisticsAndHandling["Means of Transport"]}
            />
            <ComplianceResponse
              response={response as { complianceResponse?: Record<string, unknown>; [key: string]: unknown }}
            />
          </>
        ) : null}
      </div>
    </div>
  );
};

export default ComplianceForm;
