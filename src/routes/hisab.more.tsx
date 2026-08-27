import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ChevronRight,
  FileBarChart,
  FolderOpen,
  HelpCircle,
  LogOut,
  Package,
  Users,
} from "lucide-react";
import { useHisabSession } from "@/components/hisab/session";
import { hisabLogout } from "@/lib/hisab/auth";
import { Avatar, Card, SectionTitle } from "@/components/hisab/ui";

export const Route = createFileRoute("/hisab/more")({
  component: MorePage,
});

const LINKS = [
  {
    to: "/hisab/products",
    label: "পণ্য ও ক্যাটাগরি",
    hint: "দর, একক, লো-স্টক সীমা, ওপেনিং স্টক",
    icon: Package,
  },
  { to: "/hisab/parties", label: "পার্টি", hint: "কার কাছে কত পাওনা, কাকে কত দেনা", icon: Users },
  {
    to: "/hisab/reports",
    label: "রিপোর্ট",
    hint: "মাসিক সারাংশ, Excel/CSV, প্রিন্ট",
    icon: FileBarChart,
  },
  { to: "/hisab/activity", label: "কার্যক্রম", hint: "দিন ধরে ধরে কে কী করল", icon: Activity },
  { to: "/hisab/files", label: "ফাইল", hint: "সব মেমোর ছবি এক জায়গায়", icon: FolderOpen },
  { to: "/hisab/help", label: "সাহায্য", hint: "নিয়মকানুন বাংলায়", icon: HelpCircle },
];

function MorePage() {
  const { userName } = useHisabSession();

  return (
    <div className="space-y-3">
      <Card className="flex items-center gap-3">
        <Avatar name={userName} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-slate-900 dark:text-slate-100">{userName}</p>
          <p className="text-[11px] text-slate-500">
            আপনার লেখা প্রতিটা এন্ট্রিতে এই নামটা স্থায়ীভাবে থেকে যাবে।
          </p>
        </div>
      </Card>

      <Card className="p-0">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="flex items-center gap-3 p-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <l.icon className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                  {l.label}
                </p>
                <p className="text-[11px] text-slate-500">{l.hint}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </Link>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle title="অ্যাপ" />
        <p className="text-[12px] leading-relaxed text-slate-600 dark:text-slate-400">
          ফোনের ব্রাউজারে “হোম স্ক্রিনে যোগ করুন” দিলে অ্যাপের মতো আইকন পাবেন। নতুন হিসাব লিখতে
          লিখতে নেট চলে গেলে ড্রাফট সেভ থাকে — পরে ফিরে এলে সেখান থেকেই শুরু করা যায়।
        </p>
      </Card>

      <button
        onClick={() => hisabLogout()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-3 text-[14px] font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
      >
        <LogOut className="h-4 w-4" />
        লগআউট
      </button>
    </div>
  );
}
