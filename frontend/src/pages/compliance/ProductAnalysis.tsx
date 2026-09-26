import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Copy, Send } from "lucide-react";
import { FaTrash, FaImage } from "react-icons/fa";
import { apiBaseUrl } from "../../lib/trpc";

const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) || apiBaseUrl;

interface AnalysisData {
  "HS Code": string;
  "Product Description": string;
  Perishable: boolean;
  Hazardous: boolean;
  "Required Export Document List": string[];
  Recommendations: {
    message: string;
    additionalTip: string;
  };
}

interface AnalysisResult {
  data?: AnalysisData;
  draftId?: string;
  error?: string;
}

const ProductAnalysis: React.FC = () => {
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [works, setWorks] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedImage) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedImage);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedImage]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (): void => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleFile = (file: File): void => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatusMessage("Only image files are supported. Please choose a JPG, PNG, WebP, or GIF.");
      return;
    }
    // Defence-in-depth: enforce the same 10MB cap that the server enforces so
    // the user gets feedback before uploading a large image and waiting for
    // a 413.
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setStatusMessage(`Image is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max allowed is 10 MB.`);
      return;
    }
    setSelectedImage(file);
    setAnalysisResult(null);
    setStatusMessage("");
  };

  const handleRemoveImage = (): void => {
    setSelectedImage(null);
    setAnalysisResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setStatusMessage("");
  };

  // /api/analyze-product is a legacy Express endpoint (multipart/form-data image upload via multer)
  // Keep as axios call — not in tRPC registry
  const handleAnalyze = async (): Promise<void> => {
    if (!selectedImage) return;

    setWorks(false);

    setIsLoading(true);
    setAnalysisResult(null);
    const formData = new FormData();
    formData.append("image", selectedImage);

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const response = await axios.post(
        `${BACKEND_URL}/api/analyze-product`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setAnalysisResult(response.data as AnalysisResult);
    } catch (error: unknown) {
      console.error("Error analyzing image:", error);
      // Prefer the server-provided error message (multer / route returns JSON
      // with { error: "..." }) over the generic axios status message.
      let errMsg = "Failed to analyze image";
      if (axios.isAxiosError(error)) {
        const serverMsg = (error.response?.data as { error?: string } | undefined)?.error;
        errMsg = serverMsg || error.message || errMsg;
      } else if (error instanceof Error) {
        errMsg = error.message;
      }
      setAnalysisResult({ error: errMsg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string): void => {
    void navigator.clipboard.writeText(text);
    setStatusMessage(`Copied: ${text}`);
  };

  const handleSendToCompliance = (): void => {
    if (!analysisResult || !analysisResult.draftId) {
      setStatusMessage("No draft available to send to compliance check.");
      return;
    }

    navigate(`/compliance?draftId=${analysisResult.draftId}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      {/* Main Content */}
      <div className="flex flex-col items-center px-4 sm:px-6 py-8">
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
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Product Image Analysis
                  </h2>
                  <p className="text-slate-500 text-sm mt-0.5">
                    Upload a product photo to extract HS code and required export documents.
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
                      : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !selectedImage && fileInputRef.current?.click()}
                >
                  {selectedImage ? (
                    <div className="space-y-4">
                      {previewUrl && (
                        <div className="mx-auto w-64 aspect-[4/3]">
                          <img
                            src={previewUrl}
                            alt="Preview"
                            className="w-full h-full object-contain rounded-lg border border-slate-200"
                          />
                        </div>
                      )}
                      <p className="text-sm font-semibold text-slate-800">{selectedImage.name}</p>
                      <p className="text-xs text-slate-500">{(selectedImage.size / 1024).toFixed(1)} KB</p>
                      <div className="flex flex-col sm:flex-row justify-center gap-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveImage(); }}
                          className="px-4 py-2 text-sm text-slate-600 border border-slate-300 hover:bg-slate-100 rounded-lg font-medium flex items-center justify-center gap-2"
                          disabled={isLoading}
                        >
                          <FaTrash className="w-3 h-3" />
                          Remove
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); void handleAnalyze(); }}
                          className="px-5 py-2 text-sm bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
                          disabled={isLoading}
                        >
                          {isLoading ? "Analyzing..." : "Analyze Product"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <FaImage className="text-slate-400 text-3xl mx-auto" />
                      <p className="text-sm font-medium text-slate-600">
                        {isDragging ? "Drop your image here" : "Drag & drop or click to upload"}
                      </p>
                      <p className="text-xs text-slate-400">JPG, PNG, WebP — max 10 MB</p>
                      <input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        onChange={handleFileInput}
                        className="hidden"
                        disabled={isLoading}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Loading State */}
              {isLoading && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 mb-6">
                  Scanning product characteristics and retrieving HS code...
                </div>
              )}

              {/* Analysis Results */}
              {analysisResult && (
                <div className="space-y-4">
                  {analysisResult.data ? (
                    <>
                      {/* Product Details */}
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Product Details</h3>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs text-slate-500 block">HS Code</span>
                            <span className="text-sm font-bold text-slate-800">{analysisResult.data["HS Code"]}</span>
                          </div>
                          <button
                            title="Copy HS Code"
                            onClick={() => handleCopy(analysisResult.data!["HS Code"])}
                            className="p-2 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                          >
                            <Copy size={15} />
                          </button>
                        </div>
                        <div className="flex items-start justify-between">
                          <div className="flex-1 mr-2">
                            <span className="text-xs text-slate-500 block">Description</span>
                            <span className="text-sm text-slate-700">{analysisResult.data["Product Description"]}</span>
                          </div>
                          <button
                            title="Copy Description"
                            onClick={() => handleCopy(analysisResult.data!["Product Description"])}
                            className="p-2 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 shrink-0"
                          >
                            <Copy size={15} />
                          </button>
                        </div>
                        <div className="flex gap-4 pt-1">
                          <div>
                            <span className="text-xs text-slate-500 block">Perishable</span>
                            <span className={`text-sm font-semibold ${analysisResult.data["Perishable"] ? "text-orange-600" : "text-emerald-600"}`}>
                              {analysisResult.data["Perishable"] ? "Yes" : "No"}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 block">Hazardous</span>
                            <span className={`text-sm font-semibold ${analysisResult.data["Hazardous"] ? "text-red-600" : "text-emerald-600"}`}>
                              {analysisResult.data["Hazardous"] ? "Yes" : "No"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Required Export Documents */}
                      {analysisResult.data["Required Export Document List"].length > 0 && (
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                          <h3 className="text-sm font-semibold text-blue-800 mb-2">Required Export Documents</h3>
                          <ul className="space-y-1">
                            {analysisResult.data["Required Export Document List"].map((doc, index) => (
                              <li key={index} className="flex items-center gap-2 text-sm text-slate-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                {doc}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Recommendations */}
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Recommendations</h3>
                        <p className="text-sm text-slate-700">{analysisResult.data.Recommendations.message}</p>
                        <p className="text-sm text-slate-600 italic">{analysisResult.data.Recommendations.additionalTip}</p>
                      </div>

                      <button
                        onClick={handleSendToCompliance}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <Send size={16} />
                        Send to Compliance Check
                      </button>
                    </>
                  ) : (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-red-700 text-sm font-medium">Error: {analysisResult.error}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Instructions */}
              {works && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 mt-6">
                  <span className="font-semibold text-slate-700">How it works: </span>
                  Upload a clear, well-lit product image. The system extracts the HS code, product description, and required export documentation from it.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {statusMessage && (
        <p className="mt-4 text-sm text-slate-600" role="status">{statusMessage}</p>
      )}
    </div>
  );
};

export default ProductAnalysis;
