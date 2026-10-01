import { act, renderHook } from "@testing-library/react";
import { useFieldRecognition } from "./useFieldRecognition";

const strEq = (a: string, b: string) => a === b;

describe("useFieldRecognition", () => {
  test("commit sets caption and offer, and remembers the resulting value", () => {
    const { result } = renderHook(({ v }) => useFieldRecognition(v, strEq), { initialProps: { v: "" } });
    act(() => result.current.commit({ kind: "ok", key: "recognised" }, null, "A"));
    expect(result.current.caption).toEqual({ kind: "ok", key: "recognised" });
    expect(result.current.offer).toBeNull();
  });

  test("the caption/offer clear automatically once the current value moves away from what commit resolved to", () => {
    const { result, rerender } = renderHook(({ v }) => useFieldRecognition(v, strEq), { initialProps: { v: "" } });
    act(() => result.current.commit({ kind: "ok", key: "recognised" }, null, "A"));
    rerender({ v: "A" }); // the field was actually filled with "A" — still describes the current value, stays
    expect(result.current.caption).not.toBeNull();
    rerender({ v: "something the operator typed" }); // now it's stale
    expect(result.current.caption).toBeNull();
  });

  test("a noop commit (null caption) clears any prior caption/offer immediately", () => {
    const { result } = renderHook(({ v }) => useFieldRecognition(v, strEq), { initialProps: { v: "" } });
    act(() => result.current.commit({ kind: "offer", key: "offer" }, "B", ""));
    expect(result.current.caption).not.toBeNull();
    act(() => result.current.commit(null, null, ""));
    expect(result.current.caption).toBeNull();
    expect(result.current.offer).toBeNull();
  });

  test("dismiss clears caption and offer without needing an edit", () => {
    const { result } = renderHook(({ v }) => useFieldRecognition(v, strEq), { initialProps: { v: "A" } });
    act(() => result.current.commit({ kind: "ok", key: "recognised" }, null, "A"));
    act(() => result.current.dismiss());
    expect(result.current.caption).toBeNull();
    expect(result.current.offer).toBeNull();
  });

  test("works with a non-scalar T (list) using a content-based equality check", () => {
    const listEq = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
    const { result, rerender } = renderHook(({ v }) => useFieldRecognition(v, listEq), { initialProps: { v: [] as string[] } });
    act(() => result.current.commit({ kind: "ok", key: "recognised" }, null, ["A", "B"]));
    rerender({ v: ["A", "B"] }); // same content, different array reference — must still count as "not moved on"
    expect(result.current.caption).not.toBeNull();
    rerender({ v: ["A", "B", "C"] });
    expect(result.current.caption).toBeNull();
  });
});
