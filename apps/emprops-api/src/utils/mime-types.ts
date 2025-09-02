const signatures = {
  JVBERi0: "application/pdf",
  R0lGODdh: "image/gif",
  R0lGODlh: "image/gif",
  iVBORw0KGgo: "image/png",
  "/9j/": "image/jpg",
  "/9j/4AAQSkZJRgABAQAAAQABAAD": "image/jpeg",
} as Record<string, string>;

export function detectMimeType(b64: string) {
  for (const s in signatures) {
    if (b64.indexOf(s) === 0) {
      return signatures[s];
    }
  }
}
