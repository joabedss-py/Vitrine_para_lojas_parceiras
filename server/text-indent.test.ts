import { describe, expect, it } from "vitest";
import { adjustSelectedLineIndent } from "../shared/text-indent";

describe("description indentation", () => {
  it("indents every selected line by two spaces and keeps line breaks", () => {
    const value = "Item A\nItem B\nItem C";
    const result = adjustSelectedLineIndent(value, 0, value.length, "indent");
    expect(result.value).toBe("  Item A\n  Item B\n  Item C");
    expect(result.selectionStart).toBe(0);
    expect(result.selectionEnd).toBe(result.value.length);
  });

  it("outdents selected lines without changing unindented content", () => {
    const value = "  Item A\n Item B\nItem C";
    const result = adjustSelectedLineIndent(value, 0, value.length, "outdent");
    expect(result.value).toBe("Item A\nItem B\nItem C");
  });

  it("supports indentation at a cursor and never processes the next line when selection ends at a newline", () => {
    const value = "Linha A\nLinha B";
    const result = adjustSelectedLineIndent(value, 0, 8, "indent");
    expect(result.value).toBe("  Linha A\nLinha B");
  });
});
