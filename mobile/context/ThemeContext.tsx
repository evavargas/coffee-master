import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";
export type ThemePreference = "system" | "light" | "dark";

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  /** Card surface while it is pressed (the card tinted with the lavender accent). */
  cardHover: string;
  primary: string;
  primaryForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  destructive: string;
  /** Lavender: catalog badge, decoration. Brown text on top (`accentForeground`), never as text on the background. */
  accent: string;
  accentForeground: string;
  /** Peach: favorites and the user's own recipes. Brown text on top (`highlightForeground`). */
  highlight: string;
  highlightForeground: string;
  /** Scrim behind modal panels. */
  overlay: string;
}

// Brand palette (DESIGN.md): ivory background, brown text; lavender and peach as accents.
export const lightColors: ThemeColors = {
  background: "#fffff0",
  foreground: "#3d2825",
  card: "#ffffff",
  cardHover: "#f5f2f9",
  primary: "#3d2825",
  primaryForeground: "#fffff0",
  muted: "#f3efdf",
  mutedForeground: "#6b534f",
  border: "#9b8782",
  destructive: "#b3261e",
  accent: "#b9a5d6",
  accentForeground: "#3d2825",
  highlight: "#f0ae86",
  highlightForeground: "#3d2825",
  overlay: "rgba(61, 40, 37, 0.4)",
};

// Dark: deep brown surfaces, ivory text, lavender as the action color.
export const darkColors: ThemeColors = {
  background: "#2a1a18",
  foreground: "#fffff0",
  card: "#3d2825",
  cardHover: "#4e3a3e",
  primary: "#b9a5d6",
  primaryForeground: "#3d2825",
  muted: "#4a332f",
  mutedForeground: "#d9c9c0",
  border: "#8f7772",
  destructive: "#ff8a80",
  accent: "#b9a5d6",
  accentForeground: "#3d2825",
  highlight: "#f0ae86",
  highlightForeground: "#3d2825",
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
