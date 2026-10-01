import { MAX_EXPORT_RECORDS, exportSelectionState } from "./exportKeys";

describe("exportSelectionState", () => {
  test("nothing selected: off", () => {
    expect(exportSelectionState([])).toBe("EMPTY");
  });
  test("1 to 100 selected: on", () => {
    expect(exportSelectionState(["q1"])).toBe("OK");
    expect(exportSelectionState(Array.from({ length: MAX_EXPORT_RECORDS }, (_, i) => `q${i + 1}`))).toBe("OK");
  });
  test("more than 100: too many (the server refuses it as well)", () => {
    expect(exportSelectionState(Array.from({ length: MAX_EXPORT_RECORDS + 1 }, (_, i) => `q${i + 1}`))).toBe("TOO_MANY");
  });
});
