export type IndentDirection = "indent" | "outdent";

export type IndentedTextSelection = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

const INDENT_UNIT = "  ";

export function adjustSelectedLineIndent(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  direction: IndentDirection,
): IndentedTextSelection {
  const start = Math.min(Math.max(selectionStart, 0), value.length);
  const end = Math.min(Math.max(selectionEnd, start), value.length);
  const lineStart = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const adjustedEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextLineBreak = value.indexOf("\n", adjustedEnd);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  const selectedLines = value.slice(lineStart, lineEnd).split("\n");

  const adjustedLines = selectedLines.map(line => {
    if (direction === "indent") return `${INDENT_UNIT}${line}`;
    if (line.startsWith(INDENT_UNIT)) return line.slice(INDENT_UNIT.length);
    if (line.startsWith("\t")) return line.slice(1);
    if (line.startsWith(" ")) return line.slice(1);
    return line;
  });

  const replacement = adjustedLines.join("\n");
  return {
    value: `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
    selectionStart: lineStart,
    selectionEnd: lineStart + replacement.length,
  };
}
