// External
import { TRPCError } from "@trpc/server";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";

// Internal
import { requireUserId } from "../lib/auth.js";

// Models
import { DraftModel } from "../models/Draft.js";
import { ProductAnalysisModel } from "../models/ProductAnalysis.js";
import { SaveRouteModel } from "../models/SaveRoute.js";
import { UserModel } from "../models/User.js";

// Schemas
import {
  CompanyAddressSchema,
  UserLoginSchema,
} from "../schemas/user.js";

// tRPC helpers
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** JWT token validity window. */
const TOKEN_EXPIRY = "1h";

/** bcrypt work factor. */
const BCRYPT_ROUNDS = 10;

/**
 * Maximum lengths for user-facing string inputs (H1).
 * These prevent excessive DB writes and obvious fuzzing.
 */
const MAX_NAME_LENGTH = 100;
const MAX_PASSWORD_LENGTH = 128;
const MAX_PHONE_LENGTH = 30;
const MAX_COMPANY_NAME_LENGTH = 200;
const MAX_TAX_ID_LENGTH = 50;
const MAX_ADDRESS_FIELD_LENGTH = 200;

// ---------------------------------------------------------------------------
// Helper: sign a JWT — validates secret presence at call time as a safety net.
// Never include the token or secret in error messages.
// ---------------------------------------------------------------------------
function signToken(payload: Record<string, unknown>): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Authentication service misconfigured",
    });
  }
  return jwt.sign(payload, secret, { expiresIn: TOKEN_EXPIRY });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const authRouter = router({
  /**
   * POST /createAccount → auth.createAccount
   * Public: account creation endpoint — must remain public.
   *
   * Rate-limiting hook: mount express-rate-limit before tRPC for this path
   * in backend/src/index.ts to prevent bulk account creation.
   */
  createAccount: publicProcedure
    .input(
      z.object({
        firstName: z.string().min(1).max(MAX_NAME_LENGTH).trim(),
        lastName: z.string().max(MAX_NAME_LENGTH).trim().optional(),
        emailAddress: z.string().email().max(254).toLowerCase().trim(),
        password: z
          .string()
          .min(8, "Password must be at least 8 characters")
          .max(MAX_PASSWORD_LENGTH),
      }),
    )
    .mutation(async ({ input }) => {
      const { firstName, lastName, emailAddress, password } = input;

      const userExists = await UserModel.findOne({ emailAddress });
      if (userExists) {
        if (userExists.password === "GOOGLE_AUTH_PLACEHOLDER") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This email is already registered through Google sign-in. Please sign in with Google.",
          });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User already exists",
        });
      }

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
      let newUser;
      try {
        newUser = await UserModel.create({
          firstName,
          lastName,
          emailAddress,
          password: hashedPassword,
        });
      } catch (err) {
        // Translate a duplicate-key error (race between two concurrent
        // createAccount requests) into a clean BAD_REQUEST rather than
        // a generic 500.
        const code = (err as { code?: number } | undefined)?.code;
        if (code === 11000) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "User already exists",
          });
        }
        throw err;
      }

      const token = signToken({
        id: String(newUser._id),
        email: newUser.emailAddress,
      });

      // H8: do not return the hashed password or internal fields.
      return {
        message: "Account created successfully",
        token,
        user: {
          id: newUser._id,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          emailAddress: newUser.emailAddress,
        },
      };
    }),

  /**
   * POST /loginUser → auth.loginUser
   * Public: login endpoint — must remain public.
   *
   * Rate-limiting hook: mount express-rate-limit before tRPC for this path
   * in backend/src/index.ts to prevent brute-force attacks.
   */
  loginUser: publicProcedure
    .input(UserLoginSchema)
    .mutation(async ({ input }) => {
      const { emailAddress, password } = input;

      const user = await UserModel.findOne({ emailAddress });
      if (!user) {
        // Use a generic message to avoid user enumeration.
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      if (user.password === "GOOGLE_AUTH_PLACEHOLDER") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "This account uses Google sign-in. Please sign in with Google.",
        });
      }

      const matchPassword = await bcrypt.compare(password, user.password);
      if (!matchPassword) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const token = signToken({
        id: String(user._id),
        email: user.emailAddress,
      });

      // H8: do not return the hashed password or internal fields.
      return {
        message: "Logged in successfully",
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          emailAddress: user.emailAddress,
          profilePhoto: user.profilePhoto,
        },
      };
    }),

  /**
   * GET /protectedRoute → auth.getMe
   * Protected: returns the authenticated user's profile.
   */
  getMe: protectedProcedure.query(async ({ ctx }) => {
    const userId = requireUserId(ctx);
    const user = await UserModel.findById(userId).select("-password");
    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    return {
      message: "Access granted to protected route!",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        emailAddress: user.emailAddress,
        profilePhoto: user.profilePhoto,
        phoneNumber: user.phoneNumber,
        companyName: user.companyName,
        companyAddress: user.companyAddress ?? {},
        taxId: user.taxId,
      },
    };
  }),

  /**
   * PUT /api/user/update-username → auth.updateUsername
   * Protected: updates the authenticated user's name.
   */
  updateUsername: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1).max(MAX_NAME_LENGTH).trim(),
        lastName: z.string().max(MAX_NAME_LENGTH).trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);
      const { firstName, lastName } = input;

      const updatedUser = await UserModel.findByIdAndUpdate(
        userId,
        { firstName, lastName },
        { new: true },
      );

      if (!updatedUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      return {
        message: "Username updated successfully",
        user: {
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
        },
      };
    }),

  /**
   * PUT /api/user/update-password → auth.updatePassword
   * Protected: updates the authenticated user's password.
   */
  updatePassword: protectedProcedure
    .input(
      z.object({
        newPassword: z
          .string()
          .min(8, "Password must be at least 8 characters long")
          .max(MAX_PASSWORD_LENGTH),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);
      const { newPassword } = input;

      const user = await UserModel.findById(userId);
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (user.password === "GOOGLE_AUTH_PLACEHOLDER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This account uses Google sign-in. Password changes are not allowed.",
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await UserModel.findByIdAndUpdate(
        userId,
        { password: hashedPassword },
        { new: true },
      );

      return { message: "Password updated successfully" };
    }),

  /**
   * PUT /api/user/update-profile → auth.updateProfile
   * Protected: updates the authenticated user's business profile.
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        phoneNumber: z
          .string()
          .min(1, "Phone number is required")
          .max(MAX_PHONE_LENGTH)
          .trim(),
        companyName: z.string().max(MAX_COMPANY_NAME_LENGTH).trim().optional(),
        companyAddress: CompanyAddressSchema.optional(),
        taxId: z.string().max(MAX_TAX_ID_LENGTH).trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);
      const { phoneNumber, companyName, companyAddress, taxId } = input;

      const updateData: Record<string, unknown> = {};
      updateData.phoneNumber = phoneNumber;
      if (companyName !== undefined) updateData.companyName = companyName;
      if (taxId !== undefined) updateData.taxId = taxId;

      if (companyAddress) {
        const addressFields: Record<string, string | undefined> = {
          "companyAddress.street": companyAddress.street,
          "companyAddress.city": companyAddress.city,
          "companyAddress.state": companyAddress.state,
          "companyAddress.postalCode": companyAddress.postalCode,
          "companyAddress.country": companyAddress.country,
        };

        for (const [key, value] of Object.entries(addressFields)) {
          if (value !== undefined && value !== null) {
            updateData[key] = value;
          }
        }
      }

      // H4: verify the document exists and belongs to the authenticated user
      // before updating (findByIdAndUpdate with the user's own ID ensures ownership).
      // Previously the "else" branch created a brand-new stub user without
      // email/password if the record had been deleted concurrently — that's
      // dangerous (it would bypass the unique-email index when the original
      // record came back). Reject the request in that case instead.
      const user = await UserModel.findById(userId);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const updatedUser = await UserModel.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true },
      );

      if (!updatedUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      return {
        message: "Profile updated successfully",
        user: {
          phoneNumber: updatedUser.phoneNumber,
          companyName: updatedUser.companyName,
          companyAddress: updatedUser.companyAddress ?? {},
          taxId: updatedUser.taxId,
        },
      };
    }),

  /**
   * DELETE /api/user/delete-account → auth.deleteAccount
   * Protected: deletes the authenticated user's account and all associated data.
   */
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = requireUserId(ctx);

    // Delete the user first; if that fails we surface the error before
    // wiping the orphaned data. Then clean up all owned collections in
    // parallel — they are independent and safe to run concurrently.
    const deletedUser = await UserModel.findByIdAndDelete(userId);
    if (!deletedUser) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    await Promise.all([
      DraftModel.deleteMany({ userId }),
      SaveRouteModel.deleteMany({ userId }),
      ProductAnalysisModel.deleteMany({ userId }),
    ]);

    return { message: "Account deleted successfully" };
  }),
});
