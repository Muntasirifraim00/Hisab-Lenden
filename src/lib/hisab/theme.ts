/**
 * থিম — গাঢ় (মূল) আর আলো। বাছাইটা <html data-theme="..."> এ বসে,
 * যাতে CSS টোকেনগুলো এক জায়গা থেকেই বদলায়।
 */
export type Theme = "dark" | "light";

const KEY = "hisab:theme";

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* স্টোরেজ বন্ধ থাকলে ডিফল্টেই চলবে */
  }
  return "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* উপেক্ষা */
  }
}

/**
 * পাতা আঁকার আগেই থিম বসিয়ে দেয়, নইলে এক ঝলক সাদা দেখা যায়।
 * __root-এ <script> হিসেবে বসে।
 */
export const THEME_BOOT_SCRIPT = `
try {
  var t = localStorage.getItem(${JSON.stringify(KEY)});
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
} catch (e) {
  document.documentElement.setAttribute("data-theme", "dark");
}
`.trim();
