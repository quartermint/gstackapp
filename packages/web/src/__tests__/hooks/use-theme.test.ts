import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "../../hooks/use-theme.js";

// jsdom + pool:"forks" doesn't provide a working localStorage
const store = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  removeItem: vi.fn((key: string) => store.delete(key)),
  clear: vi.fn(() => store.clear()),
  get length() { return store.size; },
  key: vi.fn((i: number) => [...store.keys()][i] ?? null),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

describe("useTheme", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to light theme", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("toggle switches to dark and adds class to documentElement", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggle();
    });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggle switches back to light from dark", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggle();
    });
    expect(result.current.theme).toBe("dark");
    act(() => {
      result.current.toggle();
    });
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("reads initial value from localStorage if set", () => {
    store.set("mc-theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("persists theme to localStorage on toggle", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggle();
    });
    expect(store.get("mc-theme")).toBe("dark");
  });
});
