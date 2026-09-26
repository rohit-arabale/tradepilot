import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

// ---------------------------------------------------------------------------
// Field length constraints — keep in sync with schemas/user.ts.
// Enforced at the DB layer as a second line of defence.
// ---------------------------------------------------------------------------
const NAME_MAX = 100;
const EMAIL_MAX = 254;
const PHONE_MAX = 30;
const COMPANY_NAME_MAX = 200;
const TAX_ID_MAX = 50;
const ADDRESS_MAX = 200;

const userSchema = new Schema({
  firstName: { type: String, required: true, maxlength: NAME_MAX },
  lastName: { type: String, required: false, maxlength: NAME_MAX },
  // Unique index prevents duplicate registrations at the DB level.
  emailAddress: { type: String, required: true, maxlength: EMAIL_MAX, index: { unique: true, sparse: false } },
  // Stored as a bcrypt hash or "GOOGLE_AUTH_PLACEHOLDER"; never stored as plaintext.
  password: { type: String, required: true },
  phoneNumber: { type: String, required: false, maxlength: PHONE_MAX },
  companyName: { type: String, required: false, maxlength: COMPANY_NAME_MAX },
  companyAddress: {
    street: { type: String, required: false, maxlength: ADDRESS_MAX },
    city: { type: String, required: false, maxlength: ADDRESS_MAX },
    state: { type: String, required: false, maxlength: ADDRESS_MAX },
    postalCode: { type: String, required: false, maxlength: 20 },
    country: { type: String, required: false, maxlength: ADDRESS_MAX },
  },
  taxId: { type: String, required: false, maxlength: TAX_ID_MAX },
  businessType: { type: String, required: false, maxlength: 100 },
  primaryContactName: { type: String, required: false, maxlength: NAME_MAX },
  primaryContactPhone: { type: String, required: false, maxlength: PHONE_MAX },
  preferredShippingMethods: [{ type: String, required: false }],
  operatingRegions: [{ type: String, required: false }],
  annualShipmentVolume: { type: Number, required: false, min: 0 },
  averageShipmentWeight: { type: Number, required: false, min: 0 },
  sustainabilityGoals: { type: String, required: false, maxlength: 1000 },
  profilePhoto: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },
});

export type UserDocument = InferSchemaType<typeof userSchema> & {
  _id: mongoose.Types.ObjectId;
};

// Preserve the legacy model name "userModel" to keep collection mapping
// consistent with the existing JS code during the migration.
export const UserModel: Model<UserDocument> =
  (mongoose.models.userModel as Model<UserDocument>) ||
  mongoose.model<UserDocument>("userModel", userSchema);

export default UserModel;
