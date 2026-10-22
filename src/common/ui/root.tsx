import { FluentProvider, webDarkTheme, webLightTheme, type Theme } from "@fluentui/react-components";
import { useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { initSdk, SDK } from "../sdk";

/** Parses "rgba(1, 2, 3, 1)", "rgb(...)", "#rrggbb" or a bare "1, 2, 3" triplet. */
function parseColor(value: string): [number, number, number] | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].substring(i, i + 2), 16)) as [number, number, number];
  const nums = v.match(/\d+(\.\d+)?/g);
  return nums && nums.length >= 3 ? [Number(nums[0]), Number(nums[1]), Number(nums[2])] : null;
}

/** Azure DevOps applies its theme as CSS variables; dark when the page background is dark. */
function detectDark(): boolean {
  const style = getComputedStyle(document.documentElement);
  const rgb = parseColor(style.getPropertyValue("--background-color")) ?? parseColor(style.getPropertyValue("--palette-neutral-0"));
  if (!rgb) return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

function useAdoTheme(): Theme {
  const [dark, setDark] = useState(detectDark);
  useEffect(() => {
    const update = () => setDark(detectDark());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return dark ? webDarkTheme : webLightTheme;
}

function ThemeRoot({ children }: { children: React.ReactNode }) {
  const theme = useAdoTheme();
  return (
    <FluentProvider theme={theme} style={{ background: "transparent", minHeight: "100%" }}>
      {children}
    </FluentProvider>
  );
}

/** Boots the SDK, renders the page and tells the host it loaded. */
export async function renderPage(App: ComponentType, beforeRender?: () => void): Promise<void> {
  try {
    await initSdk();
    beforeRender?.();
    createRoot(document.getElementById("root")!).render(
      <ThemeRoot>
        <App />
      </ThemeRoot>,
    );
    await SDK.notifyLoadSucceeded();
  } catch (e) {
    console.error(e);
    await SDK.notifyLoadFailed(e instanceof Error ? e : String(e));
  }
}
