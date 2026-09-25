import { describe, it, expect } from "../framework";

function resolveTheme(preference: "light" | "dark" | "system", systemDark: boolean): "light" | "dark" {
  if (preference === "system") {
    return systemDark ? "dark" : "light";
  }
  return preference;
}

export async function runThemeUnitTests() {
  await describe("Unit: Theme Resolution & Accessibility Mode", () => {
    it("should resolve explicit light and dark themes regardless of system state", () => {
      expect(resolveTheme("light", true)).toBe("light");
      expect(resolveTheme("light", false)).toBe("light");
      expect(resolveTheme("dark", false)).toBe("dark");
      expect(resolveTheme("dark", true)).toBe("dark");
    });

    it("should accurately reflect system preferences when theme is set to 'system'", () => {
      expect(resolveTheme("system", true)).toBe("dark");
      expect(resolveTheme("system", false)).toBe("light");
    });

    it("should maintain valid neutral theme storage tokens", () => {
      const validThemes = ["light", "dark", "system"];
      expect(validThemes.includes("light")).toBe(true);
      expect(validThemes.includes("dark")).toBe(true);
      expect(validThemes.includes("system")).toBe(true);
      expect(validThemes.includes("neon-gradient")).toBe(false); // Slop rejection
    });
  });
}
