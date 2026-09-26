import { z } from "zod";

// ---------------------------------------------------------------------------
// Length constants (H7: named constants for max lengths)
// ---------------------------------------------------------------------------
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const MAX_PHONE_LENGTH = 30;
const MAX_COMPANY_NAME_LENGTH = 200;
const MAX_TAX_ID_LENGTH = 50;
const MAX_ADDRESS_FIELD_LENGTH = 200;
const MAX_BUSINESS_TYPE_LENGTH = 100;
const MAX_SUSTAINABILITY_GOALS_LENGTH = 1000;
const MAX_STRING_ARRAY_ITEMS = 50;

export const CompanyAddressSchema = z.object({
  street: z.string().max(MAX_ADDRESS_FIELD_LENGTH).trim().optional(),
  city: z.string().max(MAX_ADDRESS_FIELD_LENGTH).trim().optional(),
  state: z.string().max(MAX_ADDRESS_FIELD_LENGTH).trim().optional(),
  postalCode: z.string().max(20).trim().optional(),
  country: z.string().max(MAX_ADDRESS_FIELD_LENGTH).trim().optional(),
});

export const UserInputSchema = z.object({
  firstName: z.string().min(1).max(MAX_NAME_LENGTH).trim(),
  lastName: z.string().max(MAX_NAME_LENGTH).trim().optional(),
  emailAddress: z.string().email().max(MAX_EMAIL_LENGTH).toLowerCase().trim(),
  password: z.string().min(8, "Password must be at least 8 characters").max(MAX_PASSWORD_LENGTH),
  phoneNumber: z.string().max(MAX_PHONE_LENGTH).trim().optional(),
  companyName: z.string().max(MAX_COMPANY_NAME_LENGTH).trim().optional(),
  companyAddress: CompanyAddressSchema.optional(),
  taxId: z.string().max(MAX_TAX_ID_LENGTH).trim().optional(),
  businessType: z.string().max(MAX_BUSINESS_TYPE_LENGTH).trim().optional(),
  primaryContactName: z.string().max(MAX_NAME_LENGTH).trim().optional(),
  primaryContactPhone: z.string().max(MAX_PHONE_LENGTH).trim().optional(),
  // H1: array fields — deduplicate and cap item count to prevent excessive writes.
  preferredShippingMethods: z
    .array(z.string().max(100).trim())
    .max(MAX_STRING_ARRAY_ITEMS)
    .transform((arr) => [...new Set(arr)])
    .optional(),
  operatingRegions: z
    .array(z.string().max(100).trim())
    .max(MAX_STRING_ARRAY_ITEMS)
    .transform((arr) => [...new Set(arr)])
    .optional(),
  // H1: numeric fields — must be non-negative.
  annualShipmentVolume: z.number().min(0).optional(),
  averageShipmentWeight: z.number().min(0).optional(),
  sustainabilityGoals: z.string().max(MAX_SUSTAINABILITY_GOALS_LENGTH).trim().optional(),
  profilePhoto: z.string().url("profilePhoto must be a valid URL").optional(),
});

export type UserInput = z.infer<typeof UserInputSchema>;

export const UserLoginSchema = z.object({
  emailAddress: z.string().email().max(MAX_EMAIL_LENGTH).toLowerCase().trim(),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

export type UserLogin = z.infer<typeof UserLoginSchema>;

export const UserUpdateSchema = UserInputSchema.partial();
export type UserUpdate = z.infer<typeof UserUpdateSchema>;
