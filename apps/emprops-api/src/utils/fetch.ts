import logger from "../logger";
import { wait } from ".";

export async function fetchBase64(url: string) {
  const response = await fetchWithRetry(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries: number = 10,
  delay: number = 5000,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error: any) {
      if (attempt === retries) {
        throw new Error(
          `Failed after ${retries + 1} attempts: ${error.message}`,
        );
      }
      // Log the error and wait for the specified delay before retrying
      logger.debug(`Attempt ${attempt + 1} failed: ${error.message}`);
      await wait(delay);
    }
  }
  // This line should never be reached because either the fetch should succeed or we should throw after the last attempt
  throw new Error(`Unexpected error: All retries failed`);
}

export async function fetchText(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  if (!response.headers.get("content-type")?.includes("text")) {
    throw new Error(`Content type of ${url} is not text`);
  }
  return await response.text();
}
