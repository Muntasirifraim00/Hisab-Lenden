import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { HISAB_USERS } from "@/lib/hisab/constants";
import { hisabLogin } from "@/lib/hisab/auth";
import { Button, ErrorNote, Input, Spinner } from "@/components/hisab/ui";

export const Route = createFileRoute("/hisab/login")({
  component: LoginPage,
});

const LAST_USER_KEY = "hisab:last-user";

function LoginPage() {
  const navigate = useNavigate();
  const [name, setName] = React.useState<string>("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_USER_KEY);
      if (last && HISAB_USERS.some((u) => u.name === last)) setName(last);
    } catch {
      /* উপেক্ষা */
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name) {
      setError("আগে নাম বাছুন।");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await hisabLogin(name, password);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    try {
      localStorage.setItem(LAST_USER_KEY, result.name);
    } catch {
      /* উপেক্ষা */
    }
    navigate({ to: "/hisab", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <span className="hb-grad mx-auto grid h-16 w-16 place-items-center rounded-2xl text-2xl font-black text-white shadow-xl shadow-brand/30">
            হি
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-ink">হিসাব</h1>
          <p className="mt-1 text-[13px] text-dim">দোকানের খাতা ও গুদাম — এক জায়গায়</p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-line bg-card p-5 shadow-2xl"
        >
          <div>
            <p className="mb-2 text-[12.5px] font-semibold text-dim">কে ঢুকছেন?</p>
            <div className="grid grid-cols-3 gap-2">
              {HISAB_USERS.map((u) => {
                const selected = u.name === name;
                return (
                  <button
                    key={u.name}
                    type="button"
                    onClick={() => {
                      setName(u.name);
                      setError(null);
                    }}
                    className={cn(
                      "rounded-xl border px-1 py-2.5 text-[11.5px] font-bold tracking-tight transition",
                      selected
                        ? "border-transparent text-white shadow-lg"
                        : "border-line bg-card-2 text-dim hover:text-ink",
                    )}
                    style={
                      selected
                        ? {
                            backgroundImage:
                              "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)",
                          }
                        : undefined
                    }
                  >
                    {u.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[12.5px] font-semibold text-dim">পাসওয়ার্ড</p>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="অন্তত ৬ অক্ষর"
                autoComplete="current-password"
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-faint"
                aria-label={show ? "লুকান" : "দেখান"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <ErrorNote>{error}</ErrorNote>

          <Button type="submit" size="lg" disabled={busy || !name} className="w-full">
            {busy ? (
              <Spinner className="h-4 w-4 border-white/40 border-t-white" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            ঢুকুন
          </Button>

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-dim">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            সাইনআপ নেই। প্রথমবার লগইন করলে অ্যাকাউন্ট আপনাআপনি তৈরি হয়ে যাবে — সেই পাসওয়ার্ডটাই
            পরে লাগবে। প্রতিটা এন্ট্রিতে কে যোগ করল স্থায়ীভাবে লেখা থাকে।
          </p>
        </form>
      </div>
    </div>
  );
}
