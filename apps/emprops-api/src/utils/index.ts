import { z } from "zod";
// IPFS client moved to archive

export function flattenObject(ob: any) {
  const toReturn = {} as any;

  for (const i in ob) {
    if (!Object.prototype.hasOwnProperty.call(ob, i)) continue;

    if (typeof ob[i] == "object" && ob[i] !== null) {
      const flatObject = flattenObject(ob[i]);
      for (const x in flatObject) {
        if (!Object.prototype.hasOwnProperty.call(flatObject, x)) continue;
        toReturn[i + "." + x] = flatObject[x];
      }
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
}

export function flattenObjectByKey(obj: any, prefix: string): any {
  const flattenedObject: any = {};

  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const value = obj[key];
      const prefixedKey = `${prefix}_${key}`;

      if (typeof value === "object" && value !== null) {
        const flattenedNested = flattenObjectByKey(value, prefixedKey);
        Object.assign(flattenedObject, flattenedNested);
      } else {
        flattenedObject[prefixedKey] = value;
      }
    }
  }

  return flattenedObject;
}

export async function uploadUngeneratedImage(
  id: string,
  ungeneratedImage: string,
) {
  const response = await fetch(ungeneratedImage);
  const imageArrayBuffer = await response.arrayBuffer();
  const imageBuffer = Buffer.from(imageArrayBuffer);
  const ext = ungeneratedImage.substring(ungeneratedImage.lastIndexOf(".") + 1);
  const fileName = `${id}_ungenerated_image.${ext}`;
  const mimeType = response.headers.get("content-type");
  if (!mimeType) throw new Error("No content type while fetching image");
  // IPFS client functionality moved to archive
  throw new Error("IPFS upload functionality has been moved to archive - implement alternative storage solution");
}

export function splitByOccurrences(
  inputString: string,
  separator: string,
  limit: number,
): string[] {
  const result: string[] = [];

  let currentIndex = 0;

  for (let i = 0; i < limit - 1; i++) {
    const index = inputString.indexOf(separator, currentIndex);

    if (index !== -1) {
      const part = inputString.substring(currentIndex, index);
      result.push(part);
      currentIndex = index + separator.length;
    } else {
      // If the separator is not found, break the loop
      break;
    }
  }

  // Add the remaining part of the string after the last separator
  const remainingPart = inputString.substring(currentIndex);
  result.push(remainingPart);

  return result;
}

export function isServiceKeyAuth(req: any): boolean {
  return (
    !req.headers["user_id"] &&
    req.headers.authorization?.split(" ")[1] === process.env.SERVICE_KEY
  );
}

export const AIGenerativeCollectionList = ["long-form"];

export function formatZodError(validationResult: z.ZodError<any>) {
  return validationResult.issues
    .map((issue) => `${issue.path} ${issue.message}`)
    .join(", ");
}

export function isErrorTrackingEnabled(): boolean {
  return process.env.SENTRY_ENABLED === "true";
}

export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function generateHash(length: number): string {
  const characters =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export function deepDelete(
  obj: Record<string, any>,
  propToDelete: string,
): void {
  if (typeof obj !== "object" || obj === null) {
    return;
  }

  for (const key in obj) {
    if (key === propToDelete) {
      delete obj[key];
    } else if (typeof obj[key] === "object") {
      deepDelete(obj[key], propToDelete);
    }
  }
}
