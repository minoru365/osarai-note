import { describe, expect, it } from "vitest";
import {
  UNIT_DEFINITIONS,
  formatBaseValue,
  formatQuantity,
  isUnitAvailableForGrade,
  isWholeIn,
  parseDecimal,
  parseQuantityToBase,
  unitStateKey,
  unitsAvailableForGrade,
} from "./units";

describe("単位の定義", () => {
  it("換算係数はすべて安全な整数である", () => {
    UNIT_DEFINITIONS.forEach((unit) => {
      expect(Number.isSafeInteger(unit.baseFactor)).toBe(true);
      expect(unit.baseFactor).toBeGreaterThan(0);
    });
  });

  it("各系統に係数1の基準単位がちょうど1つある", () => {
    const bases = UNIT_DEFINITIONS.filter((unit) => unit.baseFactor === 1);
    expect(bases.map((unit) => unit.category).sort()).toEqual(
      ["area", "length", "time", "volume", "weight"],
    );
  });

  it("未知の単位を拒否する", () => {
    expect(() => formatQuantity(1, "尺")).toThrow("未知の単位");
  });
});

describe("学年配当", () => {
  it("kmは3年、面積は4年から出題できる", () => {
    expect(isUnitAvailableForGrade("km", 3)).toBe(true);
    expect(isUnitAvailableForGrade("m2", 3)).toBe(false);
    expect(isUnitAvailableForGrade("m2", 4)).toBe(true);
  });

  it("3年で使える単位に面積を含めない", () => {
    expect(unitsAvailableForGrade(3).some((unit) => unit.category === "area")).toBe(false);
    expect(unitsAvailableForGrade(4).some((unit) => unit.category === "area")).toBe(true);
  });
});

describe("parseDecimal", () => {
  it("整数と小数を仮数と桁数へ分ける", () => {
    expect(parseDecimal("8")).toEqual({ mantissa: 8, places: 0 });
    expect(parseDecimal("8.2")).toEqual({ mantissa: 82, places: 1 });
    expect(parseDecimal("0.05")).toEqual({ mantissa: 5, places: 2 });
  });

  it("数値以外を拒否する", () => {
    ["", "-3", "1.2.3", "3.", ".5", "1e3", "３"].forEach((input) => {
      expect(parseDecimal(input)).toBeNull();
    });
  });
});

describe("parseQuantityToBase", () => {
  it("浮動小数点誤差を出さずに基準単位へ直す", () => {
    // 8.2 * 100 は IEEE 754 では 819.9999999999999 になる。
    expect(parseQuantityToBase("8.2", "dL")).toBe(820);
    expect(parseQuantityToBase("1.005", "L")).toBe(1005);
    expect(parseQuantityToBase("1.2", "L")).toBe(1200);
    expect(parseQuantityToBase("3", "km")).toBe(3_000_000);
  });

  it("係数が10の累乗でない単位でも正しく直す", () => {
    expect(parseQuantityToBase("1.5", "min")).toBe(90);
    expect(parseQuantityToBase("2", "hour")).toBe(7_200);
  });

  it("基準単位の整数にならない入力を拒否する", () => {
    expect(parseQuantityToBase("0.5", "mm")).toBeNull();
    expect(parseQuantityToBase("0.001", "min")).toBeNull();
  });

  it("数値以外を拒否する", () => {
    expect(parseQuantityToBase("あ", "m")).toBeNull();
    expect(parseQuantityToBase("-1", "m")).toBeNull();
  });
});

describe("formatBaseValue", () => {
  it("割り切れる量を整数で表示する", () => {
    expect(formatBaseValue(3_000_000, "km")).toBe("3");
    expect(formatBaseValue(1_200, "mL")).toBe("1200");
  });

  it("小数を末尾の0を落として表示する", () => {
    expect(formatBaseValue(1_200, "L")).toBe("1.2");
    expect(formatBaseValue(8_020, "L")).toBe("8.02");
    expect(formatBaseValue(8_002, "L")).toBe("8.002");
    expect(formatBaseValue(820, "dL")).toBe("8.2");
  });

  it("10の累乗でない単位の端数を表示せず拒否する", () => {
    // 90秒は1.5分であり、60進の余りを小数桁として出すと「1.3」になってしまう。
    expect(formatBaseValue(120, "min")).toBe("2");
    expect(() => formatBaseValue(90, "min")).toThrow("小数で表示できません");
  });

  it("単位付きで表示する", () => {
    expect(formatQuantity(1_200, "L")).toBe("1.2L");
    expect(formatQuantity(90, "sec")).toBe("90秒");
  });

  it("入力と表示が往復する", () => {
    ["1.2", "8.02", "3", "0.5"].forEach((input) => {
      const base = parseQuantityToBase(input, "L");
      expect(base).not.toBeNull();
      expect(formatBaseValue(base as number, "L")).toBe(input);
    });
  });
});

describe("isWholeIn", () => {
  it("その単位で割り切れるかを返す", () => {
    expect(isWholeIn(3_000, "L")).toBe(true);
    expect(isWholeIn(1_200, "L")).toBe(false);
    expect(isWholeIn(120, "min")).toBe(true);
    expect(isWholeIn(90, "min")).toBe(false);
  });
});

describe("unitStateKey", () => {
  it("系統と出題形式からキーを作る", () => {
    expect(unitStateKey("length", "conversion")).toBe("length:conversion");
  });
});
