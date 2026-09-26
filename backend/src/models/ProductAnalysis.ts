import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const productAnalysisSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  imageDetails: {
    bucketName: String,
    fileName: String,
    mimeType: String,
    signedUrl: String,
  },
  visionResponse: Object,
  geminiResponse: Object,
  timestamp: { type: Date, default: Date.now },
});

// Compound index for history list queries (per-user, newest first).
productAnalysisSchema.index({ userId: 1, timestamp: -1 });

export type ProductAnalysisDocument = InferSchemaType<typeof productAnalysisSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ProductAnalysisModel: Model<ProductAnalysisDocument> =
  (mongoose.models.ProductAnalysis as Model<ProductAnalysisDocument>) ||
  mongoose.model<ProductAnalysisDocument>("ProductAnalysis", productAnalysisSchema);

export default ProductAnalysisModel;
