/**
 * Table-driven pin of the valuecalc behaviour (F-0643).
 *
 * Every distinct shape of mod.valuecalc found in database/mod_data.sql (85 distinct
 * values over 269 mods):  OP NUMBER  with OP in + * /   (e.g. "+1000", "*1.1", "/2"),
 * and  "+(N*item.wgt)"  (N in 10, 15, 20, 25, 50).  "-" is accepted by the parser
 * but does not occur in the data; it is pinned here as well.
 *
 * The expected numbers below were captured from the original eval()-based
 * implementation BEFORE it was replaced, and must keep matching exactly.
 * Columns: valuecalc, base value, item weight (null = default 1), size, expected.
 */
const { calculateFinalValue } = require("../calculateFinalValue");
const logger = require("../../utils/logger");

jest.mock("../../utils/logger", () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const PINNED = [
    ["+10", 100, 1, "Medium", 110],
    ["+10", 1234.5, 2.5, "Medium", 1244.5],
    ["+10", 0, null, "Medium", 10],
    ["+10", 75, 3, "Large", 85],
    ["+10", 75, 4, "Small", 85],
    ["+2", 100, 1, "Medium", 102],
    ["+2", 1234.5, 2.5, "Medium", 1236.5],
    ["+2", 0, null, "Medium", 2],
    ["+2", 75, 3, "Large", 77],
    ["+2", 75, 4, "Small", 77],
    ["+1000", 100, 1, "Medium", 1100],
    ["+1000", 1234.5, 2.5, "Medium", 2234.5],
    ["+1000", 0, null, "Medium", 1000],
    ["+1000", 75, 3, "Large", 1075],
    ["+1000", 75, 4, "Small", 1075],
    ["+66000", 100, 1, "Medium", 66100],
    ["+66000", 1234.5, 2.5, "Medium", 67234.5],
    ["+66000", 0, null, "Medium", 66000],
    ["+66000", 75, 3, "Large", 66075],
    ["+66000", 75, 4, "Small", 66075],
    ["+9100", 100, 1, "Medium", 9200],
    ["+9100", 1234.5, 2.5, "Medium", 10334.5],
    ["+9100", 0, null, "Medium", 9100],
    ["+9100", 75, 3, "Large", 9175],
    ["+9100", 75, 4, "Small", 9175],
    ["+16875", 100, 1, "Medium", 16975],
    ["+16875", 1234.5, 2.5, "Medium", 18109.5],
    ["+16875", 0, null, "Medium", 16875],
    ["+16875", 75, 3, "Large", 16950],
    ["+16875", 75, 4, "Small", 16950],
    ["+5", 100, 1, "Medium", 105],
    ["+5", 1234.5, 2.5, "Medium", 1239.5],
    ["+5", 0, null, "Medium", 5],
    ["+5", 75, 3, "Large", 80],
    ["+5", 75, 4, "Small", 80],
    ["*1", 100, 1, "Medium", 100],
    ["*1", 1234.5, 2.5, "Medium", 1234.5],
    ["*1", 0, null, "Medium", 0],
    ["*1", 75, 3, "Large", 75],
    ["*1", 75, 4, "Small", 75],
    ["*1.1", 100, 1, "Medium", 110.00000000000001],
    ["*1.1", 1234.5, 2.5, "Medium", 1357.95],
    ["*1.1", 0, null, "Medium", 0],
    ["*1.1", 75, 3, "Large", 82.5],
    ["*1.1", 75, 4, "Small", 82.5],
    ["*1.5", 100, 1, "Medium", 150],
    ["*1.5", 1234.5, 2.5, "Medium", 1851.75],
    ["*1.5", 0, null, "Medium", 0],
    ["*1.5", 75, 3, "Large", 112.5],
    ["*1.5", 75, 4, "Small", 112.5],
    ["*10", 100, 1, "Medium", 1000],
    ["*10", 1234.5, 2.5, "Medium", 12345],
    ["*10", 0, null, "Medium", 0],
    ["*10", 75, 3, "Large", 750],
    ["*10", 75, 4, "Small", 750],
    ["*2", 100, 1, "Medium", 200],
    ["*2", 1234.5, 2.5, "Medium", 2469],
    ["*2", 0, null, "Medium", 0],
    ["*2", 75, 3, "Large", 150],
    ["*2", 75, 4, "Small", 150],
    ["*3", 100, 1, "Medium", 300],
    ["*3", 1234.5, 2.5, "Medium", 3703.5],
    ["*3", 0, null, "Medium", 0],
    ["*3", 75, 3, "Large", 225],
    ["*3", 75, 4, "Small", 225],
    ["/2", 100, 1, "Medium", 50],
    ["/2", 1234.5, 2.5, "Medium", 617.25],
    ["/2", 0, null, "Medium", 0],
    ["/2", 75, 3, "Large", 37.5],
    ["/2", 75, 4, "Small", 37.5],
    ["/4", 100, 1, "Medium", 25],
    ["/4", 1234.5, 2.5, "Medium", 308.625],
    ["/4", 0, null, "Medium", 0],
    ["/4", 75, 3, "Large", 18.75],
    ["/4", 75, 4, "Small", 18.75],
    ["+(10*item.wgt)", 100, 1, "Medium", 110],
    ["+(10*item.wgt)", 1234.5, 2.5, "Medium", 1259.5],
    ["+(10*item.wgt)", 0, null, "Medium", 10],
    ["+(10*item.wgt)", 75, 3, "Large", 135],
    ["+(10*item.wgt)", 75, 4, "Small", 95],
    ["+(15*item.wgt)", 100, 1, "Medium", 115],
    ["+(15*item.wgt)", 1234.5, 2.5, "Medium", 1272],
    ["+(15*item.wgt)", 0, null, "Medium", 15],
    ["+(15*item.wgt)", 75, 3, "Large", 165],
    ["+(15*item.wgt)", 75, 4, "Small", 105],
    ["+(20*item.wgt)", 100, 1, "Medium", 120],
    ["+(20*item.wgt)", 1234.5, 2.5, "Medium", 1284.5],
    ["+(20*item.wgt)", 0, null, "Medium", 20],
    ["+(20*item.wgt)", 75, 3, "Large", 195],
    ["+(20*item.wgt)", 75, 4, "Small", 115],
    ["+(25*item.wgt)", 100, 1, "Medium", 125],
    ["+(25*item.wgt)", 1234.5, 2.5, "Medium", 1297],
    ["+(25*item.wgt)", 0, null, "Medium", 25],
    ["+(25*item.wgt)", 75, 3, "Large", 225],
    ["+(25*item.wgt)", 75, 4, "Small", 125],
    ["+(50*item.wgt)", 100, 1, "Medium", 150],
    ["+(50*item.wgt)", 1234.5, 2.5, "Medium", 1359.5],
    ["+(50*item.wgt)", 0, null, "Medium", 50],
    ["+(50*item.wgt)", 75, 3, "Large", 375],
    ["+(50*item.wgt)", 75, 4, "Small", 175],
    ["-5", 100, 1, "Medium", 95],
    ["-5", 1234.5, 2.5, "Medium", 1229.5],
    ["-5", 0, null, "Medium", -5],
    ["-5", 75, 3, "Large", 70],
    ["-5", 75, 4, "Small", 70],
    ["-10.5", 100, 1, "Medium", 89.5],
    ["-10.5", 1234.5, 2.5, "Medium", 1224],
    ["-10.5", 0, null, "Medium", -10.5],
    ["-10.5", 75, 3, "Large", 64.5],
    ["-10.5", 75, 4, "Small", 64.5],
];

describe("calculateFinalValue valuecalc shapes (pinned to the former eval output)", () => {
  it.each(PINNED)("%s on base %s (weight %s, %s) -> %s", (valuecalc, base, weight, size, expected) => {
    const result = calculateFinalValue(base, "misc", null, [{ name: "m", valuecalc }], false, "Item", null, size, weight);
    expect(result).toBe(expected);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe("calculateFinalValue valuecalc safety (F-0643)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete global.__valuecalcPwned;
  });

  const run = (valuecalc, base = 100, weight = 2) =>
    calculateFinalValue(base, "misc", null, [{ name: "evil", valuecalc }], false, "Item", null, "Medium", weight);

  it.each([
    "+(global.__valuecalcPwned=1)",
    "+(globalThis.__valuecalcPwned=1)",
    "+process.exit(1)",
    "+require('fs').readFileSync('/etc/passwd')",
    "+(10*item.wgt)+(global.__valuecalcPwned=1)",
    "+5;global.__valuecalcPwned=1",
    "+5//",
    "*2**2",
    "+ 5",
    "+5 ",
    "5",
    "",
    "+",
    "+undefined_var",
    "+item.wgt*10",
    "+(item.wgt)",
    "+(10*item.wgt",
    "+(10*item.wgt))",
    "+-5",
    "+0x10",
    "+1,2",
    "+Infinity",
    "+NaN",
    "/0",
    "*1e999",
  ])("treats %j as a logged no-op and does not execute it", (valuecalc) => {
    expect(run(valuecalc)).toBe(100);
    expect(global.__valuecalcPwned).toBeUndefined();
    if (valuecalc !== "") {
      expect(logger.warn).toHaveBeenCalled();
    }
  });

  it("applies the supported shapes around an ignored one", () => {
    const mods = [
      { name: "a", valuecalc: "+50" },
      { name: "b", valuecalc: "+(global.__valuecalcPwned=1)" },
      { name: "c", valuecalc: "*2" },
    ];
    const result = calculateFinalValue(100, "misc", null, mods, false, "Item", null, "Medium", 1);
    expect(result).toBe(300);
    expect(global.__valuecalcPwned).toBeUndefined();
  });

  it("does not change the wand charge multiplication", () => {
    const mods = [{ name: "m", valuecalc: "+100" }];
    // 15 per charge * 10 charges = 150, then +100
    expect(calculateFinalValue(15, "wand", null, mods, false, "Wand of Magic Missile", 10, "Medium", 1)).toBe(250);
  });
});

describe("isValidValuecalc (admin mod validation)", () => {
  const { isValidValuecalc } = require("../calculateFinalValue");

  it.each(["+10", "+1000", "*1.1", "/2", "-5", "+(10*item.wgt)", "+(50*item.wgt)", "*.5"])("accepts %j", (v) => {
    expect(isValidValuecalc(v)).toBe(true);
  });

  it.each(["", "+", "5", "+ 5", "+5;", "+(1+1)", "+item.wgt*10", "+(10*item.wgt)+1", "+process.exit()", "**2", "+(10*5)", 5, null, undefined])("rejects %j", (v) => {
    expect(isValidValuecalc(v)).toBe(false);
  });
});

describe("seed data stays inside the supported valuecalc grammar", () => {
  it("every valuecalc in database/mod_data.sql is accepted", () => {
    const fs = require("fs");
    const path = require("path");
    const sql = fs.readFileSync(path.join(__dirname, "../../../../database/mod_data.sql"), "utf8");
    const { isValidValuecalc } = require("../calculateFinalValue");
    const rowRe = /VALUES \(\d+, '(?:[^']|'')*', (?:NULL|[\d.]+|'[^']*'), (?:NULL|'[^']*'), (NULL|'(?:[^']|'')*'),/;
    const found = [];
    for (const line of sql.split(/\r?\n/)) {
      if (!line.startsWith("INSERT INTO public.mod")) continue;
      const m = line.match(rowRe);
      expect(m).not.toBeNull();
      if (m[1] !== "NULL") found.push(m[1].slice(1, -1));
    }
    // 269 before migration 075 removed the duplicate mod 222 (Vitalguard, +500)
    expect(found.length).toBe(268);
    const invalid = found.filter((v) => !isValidValuecalc(v));
    expect(invalid).toEqual([]);
  });
});
