import { describe, expect, test } from "bun:test";
import { fmtFull, fmtNum } from "../src/ui/overlays.ts";

describe("number formatting", () => {
  test("plain integers below 10k", () => {
    expect(fmtNum(0)).toBe("0");
    expect(fmtNum(9999)).toBe("9999");
    expect(fmtNum(3721.9)).toBe("3721");
  });

  test("万 stays compact and drops the trailing .0", () => {
    expect(fmtNum(10_000)).toBe("1万");
    expect(fmtNum(12_345)).toBe("1.2万");
    expect(fmtNum(9_999_999)).toBe("1000万");
  });

  test("values rounding up to 1亿 are shown as 亿, never as 10000万", () => {
    expect(fmtNum(99_999_999)).toBe("1.00亿");
    expect(fmtNum(100_000_000)).toBe("1.00亿");
    expect(fmtNum(250_000_000)).toBe("2.50亿");
  });

  test("prices use exact grouped digits", () => {
    expect(fmtFull(20_684)).toBe("20,684");
    expect(fmtFull(999)).toBe("999");
  });
});
