import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const auditEventSchema = new Schema(
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
    eventType: {
      type: String,
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    summary: {
      type: String,
      required: true,
    },
    // Optional idempotency key — a per-user unique token supplied by the
    // client. Two appends with the same (userId, clientToken) collapse to
    // one event, so accidental double-clicks or network retries don't
    // pollute the audit chain.
    clientToken: {
      type: String,
      required: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { strict: false }
);

// Hot path: audit.recent / insights.operationsTicker list per-user, newest first.
auditEventSchema.index({ userId: 1, createdAt: -1 });
// Hot path: audit.forDraft list per-user-and-draft, oldest first.
auditEventSchema.index({ userId: 1, draftId: 1, createdAt: 1 });
// Idempotency: enforce uniqueness of (userId, clientToken) when present.
// Sparse so existing rows without the field are not pulled into the constraint.
auditEventSchema.index(
  { userId: 1, clientToken: 1 },
  { unique: true, sparse: true }
);

export type AuditEventDocument = InferSchemaType<typeof auditEventSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AuditEventModel: Model<AuditEventDocument> =
  (mongoose.models.AuditEvent as Model<AuditEventDocument>) ||
  mongoose.model<AuditEventDocument>("AuditEvent", auditEventSchema);

export default AuditEventModel;
