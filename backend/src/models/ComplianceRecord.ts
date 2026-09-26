import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const complianceRecordSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  formData: {
    type: Object,
    required: true,
  },
  complianceResponse: {
    type: Object,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  type: {
    type: String,
    required: true,
  },
});

// Compound index for history list queries (per-user, newest first).
complianceRecordSchema.index({ userId: 1, timestamp: -1 });

export type ComplianceRecordDocument = InferSchemaType<typeof complianceRecordSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ComplianceRecordModel: Model<ComplianceRecordDocument> =
  (mongoose.models.ComplianceRecord as Model<ComplianceRecordDocument>) ||
  mongoose.model<ComplianceRecordDocument>("ComplianceRecord", complianceRecordSchema);

export default ComplianceRecordModel;
