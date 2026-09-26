import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const rfidScanResultSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    draftId: {
      type: String,
      required: false,
    },
    manifestTags: {
      type: [String],
      required: true,
    },
    scannedTags: {
      type: [String],
      required: true,
    },
    matched: {
      type: [String],
      required: true,
    },
    missing: {
      type: [String],
      required: true,
    },
    extra: {
      type: [String],
      required: true,
    },
    matchPct: {
      type: Number,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  }
);

// Compound index for the hot history-list query: find by userId sorted by createdAt desc.
rfidScanResultSchema.index({ userId: 1, createdAt: -1 });

export type RfidScanResultDocument = InferSchemaType<typeof rfidScanResultSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RfidScanResultModel: Model<RfidScanResultDocument> =
  (mongoose.models.RfidScanResult as Model<RfidScanResultDocument>) ||
  mongoose.model<RfidScanResultDocument>("RfidScanResult", rfidScanResultSchema);

export default RfidScanResultModel;
