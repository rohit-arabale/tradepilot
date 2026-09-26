import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const boxCountResultSchema = new Schema(
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
    declaredCount: {
      type: Number,
      required: true,
    },
    detectedCount: {
      type: Number,
      required: true,
    },
    mismatch: {
      type: Boolean,
      required: true,
    },
    mismatchPct: {
      type: Number,
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
    },
    notes: {
      type: String,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  }
);

// Compound index for the hot history-list query: find by userId sorted by createdAt desc.
boxCountResultSchema.index({ userId: 1, createdAt: -1 });

export type BoxCountResultDocument = InferSchemaType<typeof boxCountResultSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const BoxCountResultModel: Model<BoxCountResultDocument> =
  (mongoose.models.BoxCountResult as Model<BoxCountResultDocument>) ||
  mongoose.model<BoxCountResultDocument>("BoxCountResult", boxCountResultSchema);

export default BoxCountResultModel;
