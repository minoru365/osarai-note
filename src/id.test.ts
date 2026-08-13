import { describe, expect, it, vi } from "vitest";
import { createId } from "./id";

describe("createId", () => {
  it("IDを生成する", () => {
    expect(createId()).toMatch(/^[a-zA-Z0-9-]+$/);
  });

  it("randomUUIDを利用できないHTTP環境でも異なるIDを生成する", () => {
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    vi.spyOn(Date, "now").mockReturnValue(1_786_614_000_000);
    vi.spyOn(Math, "random").mockReturnValueOnce(0.123456).mockReturnValueOnce(0.654321);

    try {
      expect(createId()).not.toBe(createId());
    } finally {
      vi.restoreAllMocks();
      if (cryptoDescriptor) Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
      else Reflect.deleteProperty(globalThis, "crypto");
    }
  });
});
