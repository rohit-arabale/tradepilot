import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const saveRouteSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  formData: {
    from: { type: String, required: true },
    to: { type: String, required: true },
    weight: { type: Number, required: true },
  },
  routeData: {
    type: Object,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for route-history queries (per-user, newest first).
saveRouteSchema.index({ userId: 1, timestamp: -1 });

export type SaveRouteDocument = InferSchemaType<typeof saveRouteSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const SaveRouteModel: Model<SaveRouteDocument> =
  (mongoose.models.SaveRoute as Model<SaveRouteDocument>) ||
  mongoose.model<SaveRouteDocument>("SaveRoute", saveRouteSchema);

export default SaveRouteModel;
