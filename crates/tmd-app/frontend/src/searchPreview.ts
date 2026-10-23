/** Preview offsets are UTF-16 units, matching Monaco and JavaScript strings. */
export function searchPreview(line: string, start: number, end: number) {
  start = Math.max(0, Math.min(start, line.length));
  let from = line.length <= 240 ? 0 : Math.max(0, start - 80);
  // Move boundaries away from the middle of a surrogate pair.
  if (from > 0 && line.charCodeAt(from) >= 0xdc00 && line.charCodeAt(from) <= 0xdfff) from--;
  let to = Math.min(line.length, from + 240);
  if (to < line.length && line.charCodeAt(to) >= 0xdc00 && line.charCodeAt(to) <= 0xdfff) to--;
  return {
    lineText: line.slice(from, to),
    previewStart: Math.max(0, Math.min(start, to) - from),
    previewEnd: Math.max(0, Math.min(Math.max(start, end), to) - from),
  };
}
