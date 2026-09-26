import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const trackingPingSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    draftId: {
      type: String,
      required: true,
      index: true,
    },
    lat: {
      type: Number,
      required: true,
    },
    lng: {
      type: Number,
      required: true,
    },
    speedKmh: {
      type: Number,
      required: true,
    },
    destinationLat: {
      type: Number,
      required: true,
    },
    destinationLng: {
      type: Number,
      required: true,
    },
    distanceKm: {
      type: Number,
      required: true,
    },
    etaMinutes: {
      type: Number,
      required: true,
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
  }
);

// Compound index for fast latest/history queries scoped by draftId, newest first.
trackingPingSchema.index({ draftId: 1, createdAt: -1 });
trackingPingSchema.index({ userId: 1, createdAt: -1 });

export type TrackingPingDocument = InferSchemaType<typeof trackingPingSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const TrackingPingModel: Model<TrackingPingDocument> =
  (mongoose.models.TrackingPing as Model<TrackingPingDocument>) ||
  mongoose.model<TrackingPingDocument>("TrackingPing", trackingPingSchema);

export default TrackingPingModel;
