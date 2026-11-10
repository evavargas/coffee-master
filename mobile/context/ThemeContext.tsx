import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";
export type ThemePreference = "system" | "light" | "dark";

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  primary: string;
  primaryForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  destructive: string;
  /** Scrim behind modal panels. */
  overlay: string;
}

// Light palette mirrors the hex values already used across the app's screens.
export const lightColors: ThemeColors = {
  background: "#faf6f1",
  foreground: "#2b1d14",
  card: "#ffffff",
  primary: "#6f4e37",
  primaryForeground: "#ffffff",
  muted: "#f1e9df",
  mutedForeground: "#7a6558",
  border: "#e5d9cc",
  destructive: "#b3261e",
  overlay: "rgba(43, 29, 20, 0.4)",
};

// Dark coffee palette: dark roast background, cream foreground, lightened
// primary/destructive so they keep enough contrast on a dark surface.
export const darkColors: ThemeColors = {
  background: "#1b140f",
  foreground: "#f1e9df",
  card: "#2b2018",
  primary: "#c9a373",
  primaryForeground: "#2b1d14",
  muted: "#2f251c",
  mutedForeground: "#b9a58f",
  border: "#46382c",
  destructive: "#ff6b60",
  overlay: "rgba(0, 0, 0, 0.6)",
};

const THEME_STORAGE_KEY = "coffeemaster.theme";

// Cycle order for the toggle button: system -> light -> dark -> system ...
const PREFERENCE_CYCLE: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

interface ThemeContextValue {
  /** Effective scheme actually rendered, resolving "system" against the OS setting. */
  scheme: ColorScheme;
  /** Raw stored preference, including "system", for the toggle button to display. */
  preference: ThemePreference;
  colors: ThemeColors;
  cyclePreference: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

interface ThemeProviderProps {
  children: ReactNode;
}

/** Provides the active color palette, defaulting to "system" until the user picks an explicit preference. */
export function ThemeProvider({ children }: ThemeProviderProps) {
  // useColorScheme already re-renders this component on OS theme changes.
  const deviceScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (isThemePreference(stored)) {
        setPreference(stored);
      }
    });
  }, []);

  const cyclePreference = useCallback(() => {
    setPreference((current) => {
      const next = PREFERENCE_CYCLE[current];
      void AsyncStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const scheme: ColorScheme = preference === "system" ? (deviceScheme === "dark" ? "dark" : "light") : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: scheme === "dark" ? darkColors : lightColors,
      scheme,
      preference,
      cyclePreference,
    }),
    [scheme, preference, cyclePreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Active palette, effective scheme, raw preference, and the cycle action. Must be used within a ThemeProvider. */
export function useAppTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within a ThemeProvider");
  }
  return context;
}
