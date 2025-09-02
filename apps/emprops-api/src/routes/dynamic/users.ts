import DynamicClient from "../../clients/dynamic-client";
import { Request, Response } from "express";
import logger from "../../logger";

interface UserResponse {
  user: {
    name: string | null;
    username: string | null;
  };
}

export async function getDynamicUser(
  req: Request,
  res: Response,
  dynamicClient: DynamicClient,
) {
  try {
    const { userId } = req.params;
    logger.info(`Attempting to fetch Dynamic user: ${userId}`);
    const userResponse = await dynamicClient.getUser(userId);

    if (userResponse?.user) {
      const user = userResponse?.user;
      const fullName = buildFullName(user.firstName, user.lastName);

      const response: UserResponse = {
        user: {
          name: fullName,
          username: user?.username || null,
        },
      };

      return res.status(200).json({ data: response, error: null });
    } else {
      return res.status(404).json({ data: null, error: "User not found" });
    }
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to fetch user data";

    // Handle 403 Forbidden (user doesn't exist) as 404
    if (message === "Forbidden") {
      logger.warn(`Dynamic user not found: ${req.params.userId}`);
      return res.status(404).json({ data: null, error: "User not found" });
    }

    // Log actual errors (not user not found)
    logger.error(e);
    return res.status(500).json({ data: null, error: message });
  }
}

function buildFullName(
  firstName: string | null,
  lastName: string | null,
): string | null {
  if (!firstName && !lastName) {
    return null; // Both are null
  }

  if (!firstName) {
    return lastName as string; // First name is null
  }

  if (!lastName) {
    return firstName as string; // Last name is null
  }

  return `${firstName} ${lastName}`; // Both are non-null
}
