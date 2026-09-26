import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import { trpc } from "../../lib/trpc";

interface ParsedFormData {
  ShipmentDetails: {
    "Origin Country": string;
    "Destination Country": string;
    "HS Code": string;
    "Product Description": string;
    Quantity: string;
    "Gross Weight": string;
  };
  TradeAndRegulatoryDetails: {
    "Incoterms 2020": string;
    "Declared Value": {
      currency: string;
      amount: string;
    };
    "Currency of Transaction": string;
    "Trade Agreement Claimed": string;
    "Dual-Use Goods": string;
    "Hazardous Material": string;
    Perishable: string;
  };
  PartiesAndIdentifiers: {
    "Shipper/Exporter": string;
    "Consignee/Importer": string;
    "Manufacturer Information": string;
    "EORI/Tax ID": string;
  };
  LogisticsAndHandling: {
    "Means of Transport": string;
    "Port of Loading": string;
    "Port of Discharge": string;
    "Special Handling": string;
    "Temperature Requirements": string;
  };
  DocumentVerification: {
    "Commercial Invoice": {
      checked: boolean;
      subItems: {
        "Invoice number present": boolean;
        "Details match shipment": boolean;
        "Customs compliant": boolean;
      };
    };
    "Packing List": {
      checked: boolean;
      subItems: {
        "Contents accurate": boolean;
        "Quantities match": boolean;
        "Matches invoice": boolean;
      };
    };
    "Certificate of Origin": {
      checked: boolean;
      subItems: {
        "Origin verified": boolean;
        "Trade agreement compliant": boolean;
      };
    };
    "Licenses/Permits": {
      checked: boolean;
      subItems: {
        "Valid number": boolean;
        "Not expired": boolean;
        "Authority verified": boolean;
      };
    };
    "Bill of Lading": {
      checked: boolean;
      subItems: {
        "Accurate details": boolean;
        "Shipping regulations compliant": boolean;
      };
    };
  };
  IntendedUseDetails: {
    "Intended Use": string;
  };
}

const CsvUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const [csvError, setCsvError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState<ParsedFormData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [send, setSend] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvStatus, setCsvStatus] = useState<string>("");

  // tRPC mutation to create a draft from CSV data
  const createDraftFromCsvMutation = trpc.compliance.createDraftFromCsv.useMutation({
    onSuccess: (data) => {
      const draftId = data.recordId;
      if (!draftId) {
        setCsvError("Draft ID not returned from server");
        setLoading(false);
        return;
      }
      navigate(`/compliance?draftId=${String(draftId)}`);
    },
    onError: (error) => {
      setCsvError(
        error.message || "Error processing compliance check. Please try again."
      );
      console.error(error);
      setLoading(false);
    },
  });

  const handleCsvUpload = (file: File): void => {
    if (!file) return;

    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result: { data: Record<string, string>[] }) => {
        try {
          if (!result.data || result.data.length === 0) {
            setCsvError(
              `"${file.name}" does not contain any data rows. Please add at least one row of shipment data below the headers and try again.`,
            );
            setLoading(false);
            return;
          }
          if (result.data.length > 1) {
            setCsvStatus(`CSV contains ${result.data.length} rows — only the first will be used.`);
          }
          const data = result.data[0];
          const parsedFormData: ParsedFormData = {
            ShipmentDetails: {
              "Origin Country": data["Origin Country"] || "",
              "Destination Country": data["Destination Country"] || "",
              "HS Code": data["HS Code"] || "",
              "Product Description": data["Product Description"] || "",
              Quantity: data["Quantity"] || "",
              "Gross Weight": data["Gross Weight"] || "",
            },
            TradeAndRegulatoryDetails: {
              "Incoterms 2020": data["Incoterms 2020"] || "",
              "Declared Value": {
                currency: data["Currency"] || "",
                amount: data["Declared Value"] || "",
              },
              "Currency of Transaction": data["Currency of Transaction"] || "",
              "Trade Agreement Claimed": data["Trade Agreement Claimed"] || "",
              "Dual-Use Goods": data["Dual-Use Goods"] || "No",
              "Hazardous Material": data["Hazardous Material"] || "No",
              Perishable: data["Perishable"] || "No",
            },
            PartiesAndIdentifiers: {
              "Shipper/Exporter": data["Shipper/Exporter"] || "",
              "Consignee/Importer": data["Consignee/Importer"] || "",
              "Manufacturer Information":
                data["Manufacturer Information"] || "",
              "EORI/Tax ID": data["EORI/Tax ID"] || "",
            },
            LogisticsAndHandling: {
              "Means of Transport": data["Means of Transport"] || "",
              "Port of Loading": data["Port of Loading"] || "",
              "Port of Discharge": data["Port of Discharge"] || "",
              "Special Handling": data["Special Handling"] || "",
              "Temperature Requirements":
                data["Temperature Requirements"] || "",
            },
            DocumentVerification: {
              "Commercial Invoice": {
                checked: data["Commercial Invoice"] === "true" || false,
                subItems: {
                  "Invoice number present":
                    data["Invoice number present"] === "true" || false,
                  "Details match shipment":
                    data["Details match shipment"] === "true" || false,
                  "Customs compliant":
                    data["Customs compliant"] === "true" || false,
                },
              },
              "Packing List": {
                checked: data["Packing List"] === "true" || false,
                subItems: {
                  "Contents accurate":
                    data["Contents accurate"] === "true" || false,
                  "Quantities match":
                    data["Quantities match"] === "true" || false,
                  "Matches invoice":
                    data["Matches invoice"] === "true" || false,
                },
              },
              "Certificate of Origin": {
                checked: data["Certificate of Origin"] === "true" || false,
                subItems: {
                  "Origin verified":
                    data["Origin verified"] === "true" || false,
                  "Trade agreement compliant":
                    data["Trade agreement compliant"] === "true" || false,
                },
              },
              "Licenses/Permits": {
                checked: data["Licenses/Permits"] === "true" || false,
                subItems: {
                  "Valid number": data["Valid number"] === "true" || false,
                  "Not expired": data["Not expired"] === "true" || false,
                  "Authority verified":
                    data["Authority verified"] === "true" || false,
                },
              },
              "Bill of Lading": {
                checked: data["Bill of Lading"] === "true" || false,
                subItems: {
                  "Accurate details":
                    data["Accurate details"] === "true" || false,
                  "Shipping regulations compliant":
                    data["Shipping regulations compliant"] === "true" || false,
                },
              },
            },
            IntendedUseDetails: {
              "Intended Use": data["Intended Use"] || "",
            },
          };

          setFormData(parsedFormData);
          setUploadedFile(file);
          setCsvError(null);
        } catch (error) {
          setCsvError(
            "Error parsing CSV file. Please ensure it matches the required format."
          );
          console.error(error);
        } finally {
          setLoading(false);
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error: (error: any) => {
        setCsvError("Failed to upload CSV file. Please try again.");
        console.error(error);
        setLoading(false);
      },
    });
  };

  const handleSendToCompliance = (): void => {
    if (!formData) {
      setCsvError("No CSV data available. Please upload a file first.");
      return;
    }

    setLoading(true);
    setSend(false);

    createDraftFromCsvMutation.mutate({
      formData: formData as unknown as Record<string, unknown>,
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (uploadedFile) {
      setCsvStatus("Please remove the previous file before uploading a new one.");
      return;
    }
    handleCsvUpload(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (uploadedFile) {
      setCsvStatus("Please remove the previous file before uploading a new one.");
      return;
    }
    // Windows/Excel often label CSVs as application/vnd.ms-excel and Safari
    // sometimes leaves type empty — fall back to extension when MIME is
    // ambiguous so the drop path matches the file picker behaviour (which
    // already accepts via accept=".csv").
    const looksLikeCsv =
      !!file &&
      (file.type === "text/csv" ||
        file.type === "application/vnd.ms-excel" ||
        file.type === "" ||
        /\.csv$/i.test(file.name));
    if (looksLikeCsv) {
      handleCsvUpload(file);
    } else {
      setCsvError("Please drop a valid CSV file.");
    }
  };

  const handleRemoveFile = (): void => {
    setUploadedFile(null);
    setFormData(null);
    setCsvError(null);
    setCsvStatus("");
  };

  const handleDownloadTemplate = (): void => {
    const headers = [
      "Origin Country",
      "Destination Country",
      "HS Code",
      "Product Description",
      "Quantity",
      "Gross Weight",
      "Incoterms 2020",
      "Currency",
      "Declared Value",
      "Currency of Transaction",
      "Trade Agreement Claimed",
      "Dual-Use Goods",
      "Hazardous Material",
      "Perishable",
      "Shipper/Exporter",
      "Consignee/Importer",
      "Manufacturer Information",
      "EORI/Tax ID",
      "Means of Transport",
      "Port of Loading",
      "Port of Discharge",
      "Special Handling",
      "Temperature Requirements",
      "Commercial Invoice",
      "Invoice number present",
      "Details match shipment",
      "Customs compliant",
      "Packing List",
      "Contents accurate",
      "Quantities match",
      "Matches invoice",
      "Certificate of Origin",
      "Origin verified",
      "Trade agreement compliant",
      "Licenses/Permits",
      "Valid number",
      "Not expired",
      "Authority verified",
      "Bill of Lading",
      "Accurate details",
      "Shipping regulations compliant",
      "Intended Use",
    ];

    // Sample rows with distinct, realistic shipments
    const sampleRows = [
      {
        "Origin Country": "US",
        "Destination Country": "IN",
        "HS Code": "2804.40",
        "Product Description": "Pharmaceutical bulk chemicals",
        "Quantity": "1000",
        "Gross Weight": "5000",
        "Incoterms 2020": "FOB",
        "Currency": "USD",
        "Declared Value": "250000",
        "Currency of Transaction": "USD",
        "Trade Agreement Claimed": "None",
        "Dual-Use Goods": "No",
        "Hazardous Material": "Yes",
        "Perishable": "No",
        "Shipper/Exporter": "Pfizer Pharma Inc, New York, USA",
        "Consignee/Importer": "Dr Reddy's Labs, Hyderabad, India",
        "Manufacturer Information": "Pfizer Manufacturing, USA",
        "EORI/Tax ID": "US123456789",
        "Means of Transport": "Air",
        "Port of Loading": "JFK Airport",
        "Port of Discharge": "Delhi Airport",
        "Special Handling": "Temperature controlled - 2-8C",
        "Temperature Requirements": "2-8 Celsius",
        "Commercial Invoice": "true",
        "Invoice number present": "true",
        "Details match shipment": "true",
        "Customs compliant": "true",
        "Packing List": "true",
        "Contents accurate": "true",
        "Quantities match": "true",
        "Matches invoice": "true",
        "Certificate of Origin": "true",
        "Origin verified": "true",
        "Trade agreement compliant": "false",
        "Licenses/Permits": "true",
        "Valid number": "true",
        "Not expired": "true",
        "Authority verified": "true",
        "Bill of Lading": "false",
        "Accurate details": "false",
        "Shipping regulations compliant": "true",
        "Intended Use": "Active pharmaceutical ingredient manufacturing",
      },
      {
        "Origin Country": "DE",
        "Destination Country": "BR",
        "HS Code": "8425.11",
        "Product Description": "Industrial pulleys and machinery",
        "Quantity": "250",
        "Gross Weight": "12000",
        "Incoterms 2020": "CIF",
        "Currency": "EUR",
        "Declared Value": "180000",
        "Currency of Transaction": "EUR",
        "Trade Agreement Claimed": "MERCOSUR",
        "Dual-Use Goods": "No",
        "Hazardous Material": "No",
        "Perishable": "No",
        "Shipper/Exporter": "Siemens Industries GmbH, Munich, Germany",
        "Consignee/Importer": "Brazilmaq Ltda, Sao Paulo, Brazil",
        "Manufacturer Information": "Siemens Manufacturing, Germany",
        "EORI/Tax ID": "DE987654321",
        "Means of Transport": "Sea",
        "Port of Loading": "Hamburg Port",
        "Port of Discharge": "Santos Port",
        "Special Handling": "Fragile - use crating",
        "Temperature Requirements": "Ambient",
        "Commercial Invoice": "true",
        "Invoice number present": "true",
        "Details match shipment": "true",
        "Customs compliant": "true",
        "Packing List": "true",
        "Contents accurate": "true",
        "Quantities match": "true",
        "Matches invoice": "true",
        "Certificate of Origin": "true",
        "Origin verified": "true",
        "Trade agreement compliant": "true",
        "Licenses/Permits": "false",
        "Valid number": "false",
        "Not expired": "false",
        "Authority verified": "false",
        "Bill of Lading": "true",
        "Accurate details": "true",
        "Shipping regulations compliant": "true",
        "Intended Use": "Industrial assembly and manufacturing",
      },
      {
        "Origin Country": "BD",
        "Destination Country": "GB",
        "HS Code": "6204.62",
        "Product Description": "Cotton textiles apparel",
        "Quantity": "5000",
        "Gross Weight": "8000",
        "Incoterms 2020": "EXW",
        "Currency": "GBP",
        "Declared Value": "95000",
        "Currency of Transaction": "GBP",
        "Trade Agreement Claimed": "GSP",
        "Dual-Use Goods": "No",
        "Hazardous Material": "No",
        "Perishable": "No",
        "Shipper/Exporter": "Fashion Asia Ltd, Dhaka, Bangladesh",
        "Consignee/Importer": "Marks and Spencer, London, UK",
        "Manufacturer Information": "Fashion Asia Manufacturing, Bangladesh",
        "EORI/Tax ID": "GB111222333",
        "Means of Transport": "Sea",
        "Port of Loading": "Chittagong Port",
        "Port of Discharge": "Southampton Port",
        "Special Handling": "Keep dry and clean",
        "Temperature Requirements": "Ambient",
        "Commercial Invoice": "true",
        "Invoice number present": "true",
        "Details match shipment": "true",
        "Customs compliant": "true",
        "Packing List": "true",
        "Contents accurate": "true",
        "Quantities match": "true",
        "Matches invoice": "true",
        "Certificate of Origin": "true",
        "Origin verified": "true",
        "Trade agreement compliant": "true",
        "Licenses/Permits": "false",
        "Valid number": "false",
        "Not expired": "false",
        "Authority verified": "false",
        "Bill of Lading": "true",
        "Accurate details": "true",
        "Shipping regulations compliant": "true",
        "Intended Use": "Retail clothing distribution",
      },
    ];

    const csvContent = Papa.unparse({ fields: headers, data: sampleRows });
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "shipment_template.csv";
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      {/* Main Content */}
      <div className="flex flex-col items-center px-4 sm:px-6 py-8">
        {/* Upload Card */}
        <div className="w-full max-w-4xl">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Card Header */}
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    CSV Bulk Import
                  </h2>
                  <p className="text-slate-500 text-sm mt-0.5">
                    Upload a CSV to create a compliance draft.
                  </p>
                </div>
              </div>
            </div>

            {/* Card Body */}
            <div className="p-8">
              {/* Upload Zone */}
              <div className="mb-6">
                <div
                  className={`border-2 border-dashed rounded-xl p-10 text-center ${
                    isDragging
                      ? "border-blue-400 bg-blue-50"
                      : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {uploadedFile ? (
                    <div className="space-y-4">
                      <p className="text-sm font-semibold text-slate-800">{uploadedFile.name}</p>
                      <p className="text-xs text-slate-500">Parsed — ready to import.</p>
                      <div className="flex flex-col sm:flex-row justify-center gap-3">
                        <button
                          onClick={handleRemoveFile}
                          className="px-4 py-2 text-sm text-slate-600 border border-slate-300 hover:bg-slate-100 rounded-lg font-medium"
                          disabled={loading}
                        >
                          Remove
                        </button>
                        <button
                          onClick={handleSendToCompliance}
                          className="px-5 py-2 text-sm bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
                          disabled={loading || !formData}
                        >
                          {loading ? "Processing..." : "Send to Compliance Check"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-slate-600">
                        {isDragging ? "Drop your file here" : "Drag & drop CSV or click to browse"}
                      </p>
                      <input
                        type="file"
                        accept=".csv"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={loading}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        disabled={loading}
                      >
                        Select CSV File
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Template Download Section */}
              {send && (
                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl mb-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Need a template?</p>
                    <p className="text-xs text-slate-500 mt-0.5">Download with all required column headers.</p>
                  </div>
                  <button
                    onClick={handleDownloadTemplate}
                    className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold"
                    disabled={loading}
                  >
                    Download Template
                  </button>
                </div>
              )}

              {/* Error Display */}
              {csvError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
                  <p className="text-red-700 text-sm">{csvError}</p>
                </div>
              )}

              {/* Loading State */}
              {loading && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 mb-4">
                  Processing your file...
                </div>
              )}

              {/* Instructions */}
              {send && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">Format: </span>
                  CSV headers must match field names (e.g., "Origin Country", "HS Code"). Use the template above for the correct format.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {csvStatus && (
        <p className="mt-4 text-sm text-slate-600" role="status">{csvStatus}</p>
      )}
    </div>
  );
};

export default CsvUploadPage;
