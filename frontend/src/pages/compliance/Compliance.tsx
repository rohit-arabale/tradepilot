import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import Papa from "papaparse";
import { ShieldCheck, Upload, FileText, ChevronDown } from "lucide-react";
import PageLead from "../../components/PageLead";
import InsightsRail from "../../components/InsightsRail";
import NewsContextCard from "../../components/NewsContextCard";
import ComplianceResponse from "./ComplianceResponse";
import AIThinking from "../../components/AIThinking";
import ReferenceNewsButton from "../../components/ReferenceNewsButton";
import { trpc } from "../../lib/trpc";

type ComplianceMode = "form" | "csv";

// Structured parsed CSV form data shape matching backend expectation
interface ParsedCsvFormData {
  ShipmentDetails: Record<string, string>;
  TradeAndRegulatoryDetails: Record<string, unknown>;
  PartiesAndIdentifiers: Record<string, string>;
  LogisticsAndHandling: Record<string, string>;
  DocumentVerification: Record<string, unknown>;
  IntendedUseDetails: Record<string, string>;
}

// Demo shipment for prefill
const DEMO_SHIPMENT_SAMPLE = {
  shipment: {
    originCountry: "IN",
    destinationCountry: "NL",
    hsCode: "8517.12",
    productDescription: "Smartphone electronics and accessories",
    quantity: "500",
    grossWeight: "2500",
  },
  trade: {
    incoterms: "CIF",
    declaredValue: "125000",
    currency: "USD",
    tradeAgreement: "GSP+",
    dualUseGoods: "No",
    hazardousMaterial: "No",
    perishable: "No",
  },
  parties: {
    shipper: "Mumbai Electronics Ltd, Mumbai, India",
    consignee: "Rotterdam Trade GmbH, Rotterdam, Netherlands",
    manufacturer: "Tata Electronics, Bangalore, India",
    eoriTaxId: "DE123456789012",
  },
  logistics: {
    meansOfTransport: "Sea",
    portOfLoading: "Mumbai Port",
    portOfDischarge: "Rotterdam Port",
    specialHandling: "Handle with care - electronic components",
    temperatureRequirements: "15-25 Celsius",
  },
  intendedUse: "Retail distribution",
};

export default function Compliance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftId, setDraftId] = useState<string>(
    searchParams.get("draftId") ?? ""
  );
  const [activeMode, setActiveMode] = useState<ComplianceMode>("form");

  // --- Form tab state: Shipment ---
  const [originCountry, setOriginCountry] = useState("US");
  const [destinationCountry, setDestinationCountry] = useState("CA");
  const [hsCode, setHsCode] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [grossWeight, setGrossWeight] = useState("");

  // --- Form tab state: Trade & Regulatory ---
  const [incoterms, setIncoterms] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [currencyValue, setCurrencyValue] = useState("");
  const [currencyTransaction, setCurrencyTransaction] = useState("");
  const [tradeAgreement, setTradeAgreement] = useState("");
  const [dualUseGoods, setDualUseGoods] = useState("No");
  const [hazardousMaterial, setHazardousMaterial] = useState("No");
  const [perishable, setPerishable] = useState("No");

  // --- Form tab state: Parties & Identifiers ---
  const [shipper, setShipper] = useState("");
  const [consignee, setConsignee] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [eoriTaxId, setEoriTaxId] = useState("");

  // --- Form tab state: Logistics & Handling ---
  const [meansOfTransport, setMeansOfTransport] = useState("");
  const [portOfLoading, setPortOfLoading] = useState("");
  const [portOfDischarge, setPortOfDischarge] = useState("");
  const [specialHandling, setSpecialHandling] = useState("");
  const [temperatureRequirements, setTemperatureRequirements] = useState("");

  // --- Form tab state: Intended Use ---
  const [intendedUse, setIntendedUse] = useState("");

  // --- Form sections collapse state ---
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    shipment: false,
    trade: false,
    parties: false,
    logistics: false,
    intendedUse: false,
  });

  // --- Demo prefill state ---
  const [useDemoData, setUseDemoData] = useState(false);

  // --- CSV tab state ---
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParsed, setCsvParsed] = useState<ParsedCsvFormData | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // --- Results ---
  const [complianceResult, setComplianceResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [submitError, setSubmitError] = useState<string>("");

  // Sync draftId to URL
  useEffect(() => {
    const params: Record<string, string> = {};
    if (draftId) params.draftId = draftId;
    setSearchParams(params);
  }, [draftId, setSearchParams]);

  const utils = trpc.useUtils();

  // Fetch draft and pre-fill form fields
  const draftQuery = trpc.inventory.getDraftById.useQuery(
    { id: draftId },
    { enabled: Boolean(draftId), retry: false }
  );

  useEffect(() => {
    if (draftQuery.data?.draft) {
      const shipment = (
        draftQuery.data.draft as unknown as {
          formData?: { ShipmentDetails?: Record<string, string> };
        }
      ).formData?.ShipmentDetails;
      if (shipment) {
        setOriginCountry(shipment["Origin Country"] || "US");
        setDestinationCountry(shipment["Destination Country"] || "CA");
        setHsCode(shipment["HS Code"] || "");
      }
    }
  }, [draftQuery.data]);

  // Toggle demo prefill
  const handleDemoPrefill = (enabled: boolean) => {
    setUseDemoData(enabled);
    if (enabled) {
      setOriginCountry(DEMO_SHIPMENT_SAMPLE.shipment.originCountry);
      setDestinationCountry(DEMO_SHIPMENT_SAMPLE.shipment.destinationCountry);
      setHsCode(DEMO_SHIPMENT_SAMPLE.shipment.hsCode);
      setProductDescription(DEMO_SHIPMENT_SAMPLE.shipment.productDescription);
      setQuantity(DEMO_SHIPMENT_SAMPLE.shipment.quantity);
      setGrossWeight(DEMO_SHIPMENT_SAMPLE.shipment.grossWeight);
      setIncoterms(DEMO_SHIPMENT_SAMPLE.trade.incoterms);
      setDeclaredValue(DEMO_SHIPMENT_SAMPLE.trade.declaredValue);
      setCurrencyValue(DEMO_SHIPMENT_SAMPLE.trade.currency);
      setCurrencyTransaction(DEMO_SHIPMENT_SAMPLE.trade.currency);
      setTradeAgreement(DEMO_SHIPMENT_SAMPLE.trade.tradeAgreement);
      setDualUseGoods(DEMO_SHIPMENT_SAMPLE.trade.dualUseGoods);
      setHazardousMaterial(DEMO_SHIPMENT_SAMPLE.trade.hazardousMaterial);
      setPerishable(DEMO_SHIPMENT_SAMPLE.trade.perishable);
      setShipper(DEMO_SHIPMENT_SAMPLE.parties.shipper);
      setConsignee(DEMO_SHIPMENT_SAMPLE.parties.consignee);
      setManufacturer(DEMO_SHIPMENT_SAMPLE.parties.manufacturer);
      setEoriTaxId(DEMO_SHIPMENT_SAMPLE.parties.eoriTaxId);
      setMeansOfTransport(DEMO_SHIPMENT_SAMPLE.logistics.meansOfTransport);
      setPortOfLoading(DEMO_SHIPMENT_SAMPLE.logistics.portOfLoading);
      setPortOfDischarge(DEMO_SHIPMENT_SAMPLE.logistics.portOfDischarge);
      setSpecialHandling(DEMO_SHIPMENT_SAMPLE.logistics.specialHandling);
      setTemperatureRequirements(DEMO_SHIPMENT_SAMPLE.logistics.temperatureRequirements);
      setIntendedUse(DEMO_SHIPMENT_SAMPLE.intendedUse);
    } else {
      // Clear all fields
      setOriginCountry("");
      setDestinationCountry("");
      setHsCode("");
      setProductDescription("");
      setQuantity("");
      setGrossWeight("");
      setIncoterms("");
      setDeclaredValue("");
      setCurrencyValue("");
      setCurrencyTransaction("");
      setTradeAgreement("");
      setDualUseGoods("No");
      setHazardousMaterial("No");
      setPerishable("No");
      setShipper("");
      setConsignee("");
      setManufacturer("");
      setEoriTaxId("");
      setMeansOfTransport("");
      setPortOfLoading("");
      setPortOfDischarge("");
      setSpecialHandling("");
      setTemperatureRequirements("");
      setIntendedUse("");
    }
  };

  // Compliance check mutation
  const checkMutation = trpc.compliance.check.useMutation({
    onSuccess: (data) => {
      setSubmitError("");
      setComplianceResult({
        complianceResponse: data.complianceResponse,
      });
      // After a draftless submission the backend creates a new draft and
      // returns its id as recordId — sync it so the UI can link to it.
      const returnedId = data.recordId ? String(data.recordId) : "";
      if (!draftId && returnedId) {
        setDraftId(returnedId);
      }
      const idToInvalidate = draftId || returnedId;
      if (idToInvalidate) {
        utils.inventory.getDraftById
          .invalidate({ id: idToInvalidate })
          .catch(() => null);
      }
    },
    onError: (err) => {
      setSubmitError(err.message || "Compliance check failed.");
    },
  });

  // CSV draft mutation
  const csvDraftMutation = trpc.compliance.createDraftFromCsv.useMutation({
    onSuccess: (data) => {
      setCsvError(null);
      const newId = String(data.recordId ?? "");
      if (newId) {
        setDraftId(newId);
        setActiveMode("form");
      }
    },
    onError: (err) => {
      setCsvError(err.message || "CSV import failed.");
    },
  });

  // --- Form tab handlers ---
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // draftId is optional on the backend — if none is selected, the backend
    // creates an ephemeral draft so a judge can type fields and get results
    // without picking from inventory first.
    checkMutation.mutate({
      ...(draftId ? { draftId } : {}),
      ShipmentDetails: {
        "Origin Country": originCountry,
        "Destination Country": destinationCountry,
        "HS Code": hsCode,
        "Product Description": productDescription,
        Quantity: quantity,
        "Gross Weight": grossWeight,
      },
      TradeAndRegulatoryDetails: {
        "Incoterms 2020": incoterms,
        "Declared Value": {
          currency: currencyValue,
          amount: declaredValue,
        },
        "Currency of Transaction": currencyTransaction,
        "Trade Agreement Claimed": tradeAgreement,
        "Dual-Use Goods": dualUseGoods,
        "Hazardous Material": hazardousMaterial,
        Perishable: perishable,
      },
      PartiesAndIdentifiers: {
        "Shipper/Exporter": shipper,
        "Consignee/Importer": consignee,
        "Manufacturer Information": manufacturer,
        "EORI/Tax ID": eoriTaxId,
      },
      LogisticsAndHandling: {
        "Means of Transport": meansOfTransport,
        "Port of Loading": portOfLoading,
        "Port of Discharge": portOfDischarge,
        "Special Handling": specialHandling,
        "Temperature Requirements": temperatureRequirements,
      },
      DocumentVerification: {},
      IntendedUseDetails: {
        "Intended Use": intendedUse,
      },
    });
  };

  // --- CSV tab handlers ---
  const parseCsvFile = (file: File) => {
    setCsvError(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result: { data: Record<string, string>[] }) => {
        if (!result.data || result.data.length === 0) {
          setCsvError("CSV file is empty. Add at least one data row.");
          return;
        }
        if (result.data.length > 1) {
          setCsvError(`Note: ${result.data.length} rows found — using the first row only.`);
        }
        const d = result.data[0];
        const parsed: ParsedCsvFormData = {
          ShipmentDetails: {
            "Origin Country": d["Origin Country"] || "",
            "Destination Country": d["Destination Country"] || "",
            "HS Code": d["HS Code"] || "",
            "Product Description": d["Product Description"] || "",
            Quantity: d["Quantity"] || "",
            "Gross Weight": d["Gross Weight"] || "",
          },
          TradeAndRegulatoryDetails: {
            "Incoterms 2020": d["Incoterms 2020"] || "",
            "Declared Value": {
              currency: d["Currency"] || "",
              amount: d["Declared Value"] || "",
            },
            "Currency of Transaction": d["Currency of Transaction"] || "",
            "Trade Agreement Claimed": d["Trade Agreement Claimed"] || "",
            "Dual-Use Goods": d["Dual-Use Goods"] || "No",
            "Hazardous Material": d["Hazardous Material"] || "No",
            Perishable: d["Perishable"] || "No",
          },
          PartiesAndIdentifiers: {
            "Shipper/Exporter": d["Shipper/Exporter"] || "",
            "Consignee/Importer": d["Consignee/Importer"] || "",
            "Manufacturer Information": d["Manufacturer Information"] || "",
            "EORI/Tax ID": d["EORI/Tax ID"] || "",
          },
          LogisticsAndHandling: {
            "Means of Transport": d["Means of Transport"] || "",
            "Port of Loading": d["Port of Loading"] || "",
            "Port of Discharge": d["Port of Discharge"] || "",
            "Special Handling": d["Special Handling"] || "",
            "Temperature Requirements": d["Temperature Requirements"] || "",
          },
          DocumentVerification: {
            "Commercial Invoice": {
              checked: d["Commercial Invoice"] === "true",
              subItems: {
                "Invoice number present":
                  d["Invoice number present"] === "true",
                "Details match shipment": d["Details match shipment"] === "true",
                "Customs compliant": d["Customs compliant"] === "true",
              },
            },
            "Packing List": {
              checked: d["Packing List"] === "true",
              subItems: {
                "Contents accurate": d["Contents accurate"] === "true",
                "Quantities match": d["Quantities match"] === "true",
                "Matches invoice": d["Matches invoice"] === "true",
              },
            },
            "Certificate of Origin": {
              checked: d["Certificate of Origin"] === "true",
              subItems: {
                "Origin verified": d["Origin verified"] === "true",
                "Trade agreement compliant":
                  d["Trade agreement compliant"] === "true",
              },
            },
            "Licenses/Permits": {
              checked: d["Licenses/Permits"] === "true",
              subItems: {
                "Valid number": d["Valid number"] === "true",
                "Not expired": d["Not expired"] === "true",
                "Authority verified": d["Authority verified"] === "true",
              },
            },
            "Bill of Lading": {
              checked: d["Bill of Lading"] === "true",
              subItems: {
                "Accurate details": d["Accurate details"] === "true",
                "Shipping regulations compliant":
                  d["Shipping regulations compliant"] === "true",
              },
            },
          },
          IntendedUseDetails: {
            "Intended Use": d["Intended Use"] || "",
          },
        };
        setCsvFile(file);
        setCsvParsed(parsed);
      },
      error: () => {
        setCsvError("Failed to parse CSV. Check format and try again.");
      },
    });
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseCsvFile(file);
  };

  const handleCsvDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ok =
      file.type === "text/csv" ||
      file.type === "application/vnd.ms-excel" ||
      file.type === "" ||
      /\.csv$/i.test(file.name);
    if (ok) parseCsvFile(file);
    else setCsvError("Please drop a CSV file.");
  };

  const handleCsvSubmit = () => {
    if (!csvParsed) return;
    csvDraftMutation.mutate({
      formData: csvParsed as unknown as Record<string, unknown>,
    });
  };

  const handleCsvReset = () => {
    setCsvFile(null);
    setCsvParsed(null);
    setCsvError(null);
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const handleDownloadTemplate = () => {
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

  // Tab config
  const TABS: { id: ComplianceMode; label: string; icon: React.ReactNode }[] =
    [
      {
        id: "form",
        label: "Compliance Form",
        icon: <ShieldCheck className="w-4 h-4" />,
      },
      {
        id: "csv",
        label: "CSV Intake",
        icon: <FileText className="w-4 h-4" />,
      },
    ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12">

      <PageLead
        title="Screen for export compliance"
        sub="Gemini extracts the HS code, regulatory flags, and dual-use warnings. Fill the form or drop a CSV to get started."
      />

      {/* Mode tabs */}
      <div className="flex border-b border-slate-200 gap-6 overflow-x-auto pb-px">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveMode(tab.id)}
            className={`flex items-center gap-2 px-1 py-3 border-b-2 font-semibold text-sm transition-colors whitespace-nowrap ${
              activeMode === tab.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">

          {/* ---- FORM TAB ---- */}
          {activeMode === "form" && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Verify Shipment Details
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Origin, destination, and HS code are required. All other fields optional.
                  </p>
                </div>
              </div>

              {/* Demo prefill toggle */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <input
                  type="checkbox"
                  id="demo-prefill"
                  checked={useDemoData}
                  onChange={(e) => handleDemoPrefill(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="demo-prefill" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Demo: prefill realistic electronics shipment (Mumbai → Rotterdam)
                </label>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-4">
                {/* SHIPMENT DETAILS */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedSections(prev => ({ ...prev, shipment: !prev.shipment }))}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <span className="font-semibold text-slate-900">Shipment Details</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-600 transition-transform ${expandedSections.shipment ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {expandedSections.shipment && (
                    <div className="p-4 space-y-3 border-t border-slate-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Origin Country <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={originCountry}
                            onChange={(e) => setOriginCountry(e.target.value)}
                            placeholder="e.g. IN"
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Destination Country <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={destinationCountry}
                            onChange={(e) => setDestinationCountry(e.target.value)}
                            placeholder="e.g. NL"
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          HS Code <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 8517.12"
                          value={hsCode}
                          onChange={(e) => setHsCode(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Product Description
                          <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Smartphone electronics and accessories"
                          value={productDescription}
                          onChange={(e) => setProductDescription(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Quantity
                            <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 500"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Gross Weight (kg)
                            <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 2500"
                            value={grossWeight}
                            onChange={(e) => setGrossWeight(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* TRADE & REGULATORY DETAILS */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedSections(prev => ({ ...prev, trade: !prev.trade }))}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <span className="font-semibold text-slate-900">Trade & Regulatory</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-600 transition-transform ${expandedSections.trade ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {expandedSections.trade && (
                    <div className="p-4 space-y-3 border-t border-slate-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Incoterms 2020
                            <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                          </label>
                          <input type="text" placeholder="e.g. CIF" value={incoterms} onChange={(e) => setIncoterms(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Currency
                            <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                          </label>
                          <input type="text" placeholder="e.g. USD" value={currencyValue} onChange={(e) => setCurrencyValue(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Declared Value
                            <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                          </label>
                          <input type="text" placeholder="e.g. 125000" value={declaredValue} onChange={(e) => setDeclaredValue(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Currency of Transaction
                            <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                          </label>
                          <input type="text" placeholder="e.g. USD" value={currencyTransaction} onChange={(e) => setCurrencyTransaction(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Trade Agreement Claimed
                          <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                        </label>
                        <input type="text" placeholder="e.g. GSP+" value={tradeAgreement} onChange={(e) => setTradeAgreement(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">Dual-Use Goods</label>
                          <select value={dualUseGoods} onChange={(e) => setDualUseGoods(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option>Yes</option>
                            <option>No</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">Hazardous Material</label>
                          <select value={hazardousMaterial} onChange={(e) => setHazardousMaterial(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option>Yes</option>
                            <option>No</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">Perishable</label>
                          <select value={perishable} onChange={(e) => setPerishable(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option>Yes</option>
                            <option>No</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* PARTIES & IDENTIFIERS */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedSections(prev => ({ ...prev, parties: !prev.parties }))}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <span className="font-semibold text-slate-900">Parties & Identifiers</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-600 transition-transform ${expandedSections.parties ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {expandedSections.parties && (
                    <div className="p-4 space-y-3 border-t border-slate-200">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Shipper/Exporter
                          <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                        </label>
                        <input type="text" placeholder="e.g. Mumbai Electronics Ltd, Mumbai, India" value={shipper} onChange={(e) => setShipper(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Consignee/Importer
                          <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                        </label>
                        <input type="text" placeholder="e.g. Rotterdam Trade GmbH, Netherlands" value={consignee} onChange={(e) => setConsignee(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Manufacturer Information
                          <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                        </label>
                        <input type="text" placeholder="e.g. Tata Electronics, Bangalore, India" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          EORI/Tax ID
                          <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                        </label>
                        <input type="text" placeholder="e.g. DE123456789012" value={eoriTaxId} onChange={(e) => setEoriTaxId(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                    </div>
                  )}
                </div>

                {/* LOGISTICS & HANDLING */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedSections(prev => ({ ...prev, logistics: !prev.logistics }))}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <span className="font-semibold text-slate-900">Logistics & Handling</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-600 transition-transform ${expandedSections.logistics ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {expandedSections.logistics && (
                    <div className="p-4 space-y-3 border-t border-slate-200">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Means of Transport
                          <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                        </label>
                        <input type="text" placeholder="e.g. Sea" value={meansOfTransport} onChange={(e) => setMeansOfTransport(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Port of Loading
                            <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                          </label>
                          <input type="text" placeholder="e.g. Mumbai Port" value={portOfLoading} onChange={(e) => setPortOfLoading(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Port of Discharge
                            <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                          </label>
                          <input type="text" placeholder="e.g. Rotterdam Port" value={portOfDischarge} onChange={(e) => setPortOfDischarge(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Special Handling
                          <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                        </label>
                        <input type="text" placeholder="e.g. Handle with care - electronic components" value={specialHandling} onChange={(e) => setSpecialHandling(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Temperature Requirements
                          <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                        </label>
                        <input type="text" placeholder="e.g. 15-25 Celsius" value={temperatureRequirements} onChange={(e) => setTemperatureRequirements(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                    </div>
                  )}
                </div>

                {/* INTENDED USE */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedSections(prev => ({ ...prev, intendedUse: !prev.intendedUse }))}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <span className="font-semibold text-slate-900">Intended Use</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-600 transition-transform ${expandedSections.intendedUse ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {expandedSections.intendedUse && (
                    <div className="p-4 space-y-3 border-t border-slate-200">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Intended Use
                          <span className="text-slate-400 font-normal text-xs ml-1">(optional)</span>
                        </label>
                        <input type="text" placeholder="e.g. Retail distribution" value={intendedUse} onChange={(e) => setIntendedUse(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                    </div>
                  )}
                </div>

                {checkMutation.isPending && (
                  <AIThinking
                    steps={[
                      "Reading shipment context…",
                      "Cross-checking trade regulations…",
                      "Computing compliance score & documents…",
                    ]}
                  />
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={checkMutation.isPending}
                    className="px-5 py-3 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg"
                  >
                    {checkMutation.isPending
                      ? "Checking..."
                      : "Run Compliance Check"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ---- CSV TAB ---- */}
          {activeMode === "csv" && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  CSV Bulk Import
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Upload a CSV to create a compliance draft instantly.
                </p>
              </div>

              {!csvFile ? (
                <div
                  className={`border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center gap-3 ${
                    isDragging
                      ? "border-blue-400 bg-blue-50"
                      : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleCsvDrop}
                >
                  <Upload className="w-8 h-8 text-slate-400" />
                  <p className="text-sm font-medium text-slate-600">
                    {isDragging ? "Drop your file here" : "Drag & drop CSV"}
                  </p>
                  <p className="text-sm text-slate-400">or click to browse</p>
                  <input
                    type="file"
                    accept=".csv"
                    ref={csvInputRef}
                    onChange={handleCsvFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => csvInputRef.current?.click()}
                    className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg"
                  >
                    Select CSV File
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 py-3 border-b border-slate-200">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {csvFile.name}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Parsed successfully — ready to import.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCsvReset}
                      className="px-5 py-3 border border-gray-200 hover:bg-gray-50 text-gray-900 text-sm font-semibold rounded-lg"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={handleCsvSubmit}
                      disabled={csvDraftMutation.isPending}
                      className="px-5 py-3 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg"
                    >
                      {csvDraftMutation.isPending ? "Importing..." : "Import Draft"}
                    </button>
                  </div>
                </div>
              )}

              {csvError && (
                <p className="text-sm text-red-600">{csvError}</p>
              )}

              {csvDraftMutation.isPending && (
                <p className="text-sm text-blue-700">Creating draft from CSV...</p>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    Need a template?
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Download with all required column headers pre-filled.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-5 py-3 border border-gray-200 hover:bg-gray-50 text-gray-900 text-sm font-semibold rounded-lg"
                >
                  Download Template
                </button>
              </div>
            </div>
          )}


          {submitError && (
            <p className="text-sm text-red-600" role="alert">{submitError}</p>
          )}

          {/* ---- Results ---- */}
          {complianceResult && (
            <div className="space-y-6">
              <NewsContextCard
                surface="compliance"
                origin={originCountry}
                destination={destinationCountry}
                hsCode={hsCode}
              />
              <ComplianceResponse
                response={
                  complianceResult as {
                    complianceResponse?: Record<string, unknown>;
                    [key: string]: unknown;
                  }
                }
              />
              <ReferenceNewsButton
                subject={hsCode || `${originCountry} ${destinationCountry}`}
                kind="compliance"
              />
            </div>
          )}
        </div>

        <aside className="lg:col-span-4">
          <InsightsRail
            draftId={draftId || undefined}
            title="Regulatory Logs"
          />
        </aside>
      </div>
    </div>
  );
}
