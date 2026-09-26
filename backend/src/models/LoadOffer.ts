import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const loadOfferSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    originCity: {
      type: String,
      required: true,
    },
    destinationCity: {
      type: String,
      required: true,
    },
    weightKg: {
      type: Number,
      required: true,
    },
    pickupDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["open", "cancelled", "matched"],
      default: "open",
    },
    notes: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  }
);

// Compound index for list queries (latest offers by user) and match queries
// (open offers in a date window, excluding self).
loadOfferSchema.index({ userId: 1, createdAt: -1 });
loadOfferSchema.index({ status: 1, pickupDate: 1 });

export type LoadOfferDocument = InferSchemaType<typeof loadOfferSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const LoadOfferModel: Model<LoadOfferDocument> =
  (mongoose.models.LoadOffer as Model<LoadOfferDocument>) ||
  mongoose.model<LoadOfferDocument>("LoadOffer", loadOfferSchema);

export default LoadOfferModel;
