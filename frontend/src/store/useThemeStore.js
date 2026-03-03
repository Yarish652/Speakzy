import { create } from "zustand";

export const useThemeStore = create((set) => ({
  theme: localStorage.getItem("speakzy-theme") || "coffee",
  setTheme: (theme) => {
          localStorage.setItem("speakzy-theme", theme);
    set({ theme });
  },
}));
