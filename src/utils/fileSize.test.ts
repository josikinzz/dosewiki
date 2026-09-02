import { describe, expect, it } from "vitest";
import { formatFileSize } from "./fileSize";

describe("formatFileSize", () => {
  it("uses decimal units so the label matches Finder and download shelves", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(999)).toBe("999 B");
    expect(formatFileSize(1_000)).toBe("1 KB");
    expect(formatFileSize(523_546)).toBe("524 KB");
    expect(formatFileSize(1_000_000)).toBe("1.0 MB");
    expect(formatFileSize(1_246_046)).toBe("1.2 MB");
    expect(formatFileSize(23_895_032)).toBe("23.9 MB");
    expect(formatFileSize(1_500_000_000)).toBe("1.5 GB");
  });

  it("never prints a rounded value that belongs to the next unit", () => {
    // 999.5 KB rounds to 1000 KB, which reads as a megabyte.
    expect(formatFileSize(999_500)).toBe("1.0 MB");
    expect(formatFileSize(999_499)).toBe("999 KB");
    // 999.95 MB rounds to 1000.0 MB.
    expect(formatFileSize(999_950_000)).toBe("1.0 GB");
    expect(formatFileSize(999_940_000)).toBe("999.9 MB");
  });
});
