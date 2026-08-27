import { createClient } from "@supabase/supabase-js";

/**
 * Supabase ক্লায়েন্ট।
 *
 * ব্রাউজারে VITE_* ভেরিয়েবল বিল্ড-টাইমে বসে যায়; SSR-এ process.env থেকে পড়া হয়।
 * চাবি না থাকলে অ্যাপ চালু হওয়ার সময়েই স্পষ্ট বার্তা দেয় — পরে রহস্যময়
 * "Failed to fetch" দেখার চেয়ে সেটা ভালো।
 */
function createSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    const missing = [
      ...(!url ? ["VITE_SUPABASE_URL"] : []),
      ...(!key ? ["VITE_SUPABASE_PUBLISHABLE_KEY"] : []),
    ].join(", ");
    throw new Error(`Supabase-এর সেটিং নেই (${missing})। .env.example দেখে .env ফাইল বানান।`);
  }

  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

let cached: ReturnType<typeof createSupabaseClient> | undefined;

// প্রথমবার ব্যবহারের সময় তৈরি হয়, যাতে SSR মডিউল লোডেই ভেঙে না পড়ে।
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_target, prop, receiver) {
    if (!cached) cached = createSupabaseClient();
    return Reflect.get(cached, prop, receiver);
  },
});
