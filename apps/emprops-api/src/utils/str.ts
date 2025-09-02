export function sanitizeBreaks(str: string): string {
  return str.replace(/(\r\n|\n|\r|")/gm, "");
}
