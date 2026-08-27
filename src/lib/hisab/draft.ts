/**
 * ড্রাফট — লিখতে লিখতে নেট চলে গেলে বা ভুলে পাতা বন্ধ হলে লেখা হারায় না।
 * সেভ হওয়ার পর ড্রাফট মুছে যায়।
 */
const KEY = "hisab:draft:new-entry";

export function saveDraft(value: unknown) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* স্টোরেজ বন্ধ থাকলে চুপচাপ এগোবে */
  }
}

export function loadDraft<T>(maxAgeMs = 7 * 86_400_000): { at: number; value: T } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: T };
    if (!parsed?.at || Date.now() - parsed.at > maxAgeMs) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* উপেক্ষা */
  }
}
