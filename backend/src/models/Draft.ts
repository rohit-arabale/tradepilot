import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const draftSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    formData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    complianceData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    routeData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    carbonAnalysisData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    mapData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    productAnalysisData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { strict: false }
);

// Compound index for the hot path: list drafts per-user, newest first.
draftSchema.index({ userId: 1, timestamp: -1 });
// Status-bucket queries used by the inventory tabs.
draftSchema.index({
  userId: 1,
  "statuses.compliance": 1,
  "statuses.routeOptimization": 1,
});

export type DraftDocument = InferSchemaType<typeof draftSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DraftModel: Model<DraftDocument> =
  (mongoose.models.Draft as Model<DraftDocument>) ||
  mongoose.model<DraftDocument>("Draft", draftSchema);

export default DraftModel;
