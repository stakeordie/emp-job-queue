import { PrismaClientType } from "@app/types/database";
import { CreditsService } from "../../lib/credits";

import { Request, Response } from "express";

/**
 * Server-side authentication endpoint for Studio v2 frontend
 *
 * This endpoint supports the refactored frontend that uses server-side auth
 * instead of client-side Dynamic Labs authentication. The frontend expects
 * JWT tokens in HTTP cookies and user data including credits from our database.
 */
export default function createAuthMeHandler(
  creditsService: CreditsService,
  _prisma: PrismaClientType,
) {
  return async function (req: Request, res: Response) {
    try {
      // Extract user info from JWT middleware headers
      const userId = req.headers["user_id"] as string;
      const userEmail = req.headers["user_email"] as string;
      const userScope = req.headers["user_scope"] as string;

      // If no user ID, user is not authenticated
      if (!userId) {
        return res.status(200).json({
          isAuthenticated: false,
          user: null,
        });
      }

      // Get user's current credit balance from database
      let credits = 0;
      try {
        const creditsResult = await creditsService.getTotalCredits(userId);
        // Convert Decimal to number for JSON serialization
        credits =
          typeof creditsResult === "number"
            ? creditsResult
            : Number(creditsResult);
      } catch (error) {
        console.error("Failed to fetch credits for user:", userId, error);
        // Continue with credits as 0 rather than failing the entire request
      }

      // Return user data in format expected by frontend
      return res.status(200).json({
        isAuthenticated: true,
        user: {
          id: userId,
          email: userEmail || "",
          credits: credits,
          userId: userId, // Backward compatibility alias
          scope: userScope, // Include scope for potential permission checks
        },
      });
    } catch (error) {
      console.error("Auth API error:", error);

      // Always return 200 with error state - frontend expects this format
      return res.status(200).json({
        isAuthenticated: false,
        user: null,
      });
    }
  };
}
