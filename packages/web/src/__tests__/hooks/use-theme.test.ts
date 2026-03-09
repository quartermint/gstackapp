import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "../../hooks/use-theme.js";

describe("useTheme", () => {
  beforeEach(() => {
    // Clear localStorage and remove dark class before each test
    localStorage.clear();
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
    localStorage.setItem("mc-theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("persists theme to localStorage on toggle", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggle();
    });
    expect(localStorage.getItem("mc-theme")).toBe("dark");
  });
});
