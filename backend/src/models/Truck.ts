import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const truckSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    plate: {
      type: String,
      required: true,
    },
    capacityKg: {
      type: Number,
      required: true,
    },
    baseCity: {
      type: String,
      required: true,
    },
    driverName: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { strict: true }
);

// Compound index for list queries scoped per-user, newest first.
truckSchema.index({ userId: 1, createdAt: -1 });

export type TruckDocument = InferSchemaType<typeof truckSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const TruckModel: Model<TruckDocument> =
  (mongoose.models.Truck as Model<TruckDocument>) ||
  mongoose.model<TruckDocument>("Truck", truckSchema);

export default TruckModel;
