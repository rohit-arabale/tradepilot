import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * FleetTrip — a single historical transport record for a truck.
 * Created in bulk by the seedDemoFleet mutation; can be extended for
 * live trip tracking later.
 */
const fleetTripSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    truckId: {
      type: Schema.Types.ObjectId,
      ref: "Truck",
      required: true,
      index: true,
    },
    dateISO: {
      type: String,
      required: true,
    },
    originCity: {
      type: String,
      required: true,
    },
    destCity: {
      type: String,
      required: true,
    },
    payloadKg: {
      type: Number,
      required: true,
    },
    distanceKm: {
      type: Number,
      required: true,
    },
    durationHours: {
      type: Number,
      required: true,
    },
    fuelCost: {
      type: Number,
      required: true,
    },
    onTime: {
      type: Boolean,
      required: true,
    },
  },
  { strict: true },
);

fleetTripSchema.index({ userId: 1, truckId: 1 });
fleetTripSchema.index({ userId: 1, dateISO: -1 });

export type FleetTripDocument = InferSchemaType<typeof fleetTripSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FleetTripModel: Model<FleetTripDocument> =
  (mongoose.models.FleetTrip as Model<FleetTripDocument>) ||
  mongoose.model<FleetTripDocument>("FleetTrip", fleetTripSchema);

export default FleetTripModel;
