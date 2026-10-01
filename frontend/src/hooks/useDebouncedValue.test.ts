import { act, renderHook } from "@testing-library/react";
import { useDebouncedValue } from "./useDebouncedValue";

describe("useDebouncedValue (SA-13 debounce)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("holds the old value until the value has been stable for the delay", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), { initialProps: { v: 1 } });
    expect(result.current).toBe(1);
    rerender({ v: 2 });
    act(() => void vi.advanceTimersByTime(299));
    expect(result.current).toBe(1);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(2);
  });
  test("a burst of changes yields only the last value, once", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), { initialProps: { v: 1 } });
    rerender({ v: 2 });
    act(() => void vi.advanceTimersByTime(200));
    rerender({ v: 3 });
    act(() => void vi.advanceTimersByTime(200));
    expect(result.current).toBe(1);
    act(() => void vi.advanceTimersByTime(100));
    expect(result.current).toBe(3);
  });
});
