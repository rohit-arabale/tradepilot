import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const weightCheckSchema = new Schema(
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
    declaredWeightKg: {
      type: Number,
      required: true,
    },
    measuredWeightKg: {
      type: Number,
      required: true,
    },
    deviationKg: {
      type: Number,
      required: true,
    },
    deviationPct: {
      type: Number,
      required: true,
    },
    thresholdPct: {
      type: Number,
      required: true,
    },
    flagged: {
      type: Boolean,
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
weightCheckSchema.index({ userId: 1, createdAt: -1 });

export type WeightCheckDocument = InferSchemaType<typeof weightCheckSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const WeightCheckModel: Model<WeightCheckDocument> =
  (mongoose.models.WeightCheck as Model<WeightCheckDocument>) ||
  mongoose.model<WeightCheckDocument>("WeightCheck", weightCheckSchema);

export default WeightCheckModel;
