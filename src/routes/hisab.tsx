import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import {
  Activity,
  Bell,
  Boxes,
  ChevronRight,
  FileBarChart,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  Receipt,
  Settings,
  ShoppingCart,
  Sun,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { HisabSessionProvider, useHisabSession } from "@/components/hisab/session";
import { Avatar, IconTile, Spinner, type Tone } from "@/components/hisab/ui";
import { hisabLogout } from "@/lib/hisab/auth";
import { applyTheme, readTheme, type Theme } from "@/lib/hisab/theme";
import { bnDateLong } from "@/lib/hisab/format";

export const Route = createFileRoute("/hisab")({
  head: () => ({
    meta: [
      { title: "হিসাব — দোকানের খাতা ও গুদাম" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "theme-color", content: "#080a14" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "হিসাব" },
    ],
    links: [
      { rel: "manifest", href: "/hisab.webmanifest" },
      { rel: "icon", type: "image/svg+xml", href: "/hisab-icon.svg" },
      { rel: "apple-touch-icon", href: "/hisab-icon.svg" },
    ],
  }),
  component: HisabLayout,
});

/* ---------------------------- নেভিগেশন ---------------------------- */

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  tone: Tone;
  exact?: boolean;
};

const NAV_GROUPS: { label: string; dot: string; items: NavItem[] }[] = [
  {
    label: "প্রধান",
    dot: "var(--a-sky)",
    items: [
      { to: "/hisab", label: "ড্যাশবোর্ড", icon: LayoutDashboard, tone: "sky", exact: true },
      { to: "/hisab/list", label: "সব হিসাব", icon: ListChecks, tone: "violet" },
      { to: "/hisab/activity", label: "কার্যক্রম", icon: Activity, tone: "teal" },
    ],
  },
  {
    label: "গুদাম ও পণ্য",
    dot: "var(--a-mint)",
    items: [
      { to: "/hisab/products", label: "পণ্য ও ক্যাটাগরি", icon: Package, tone: "mint" },
      { to: "/hisab/stock", label: "স্টক", icon: Boxes, tone: "amber" },
    ],
  },
  {
    label: "হিসাব ও পার্টি",
    dot: "var(--a-amber)",
    items: [
      { to: "/hisab/parties", label: "পার্টি", icon: Users, tone: "rose" },
      { to: "/hisab/reports", label: "রিপোর্ট", icon: FileBarChart, tone: "sky" },
      { to: "/hisab/files", label: "ফাইল", icon: FolderOpen, tone: "violet" },
    ],
  },
  {
    label: "অন্যান্য",
    dot: "var(--a-violet)",
    items: [{ to: "/hisab/help", label: "সাহায্য", icon: HelpCircle, tone: "teal" }],
  },
];

/** নিচের বারে ৫টা — ফোনের জন্য */
const BOTTOM_NAV: NavItem[] = [
  { to: "/hisab", label: "ড্যাশবোর্ড", icon: LayoutDashboard, tone: "sky", exact: true },
  { to: "/hisab/list", label: "হিসাব", icon: ListChecks, tone: "violet" },
  { to: "/hisab/stock", label: "স্টক", icon: Boxes, tone: "amber" },
  { to: "/hisab/more", label: "আরও", icon: Menu, tone: "teal" },
];

const isActive = (pathname: string, item: NavItem) =>
  item.exact ? pathname === item.to : pathname.startsWith(item.to);

/** ঠিকানা → পাতার শিরোনাম */
const TITLES: [string, string][] = [
  ["/hisab/list", "সব হিসাব"],
  ["/hisab/new", "নতুন হিসাব"],
  ["/hisab/invoice", "হিসাবের বিস্তারিত"],
  ["/hisab/stock", "স্টক"],
  ["/hisab/products", "পণ্য ও ক্যাটাগরি"],
  ["/hisab/parties", "পার্টি"],
  ["/hisab/reports", "রিপোর্ট"],
  ["/hisab/activity", "কার্যক্রম"],
  ["/hisab/files", "ফাইল"],
  ["/hisab/help", "সাহায্য"],
  ["/hisab/more", "আরও"],
];

const pageTitle = (pathname: string) =>
  TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "ড্যাশবোর্ড";

/* ---------------------------- খোলস ---------------------------- */

function HisabLayout() {
  return (
    <HisabSessionProvider>
      <Shell />
      <Toaster position="top-center" richColors closeButton theme="system" />
    </HisabSessionProvider>
  );
}

function Shell() {
  const { status, userName } = useHisabSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawer, setDrawer] = React.useState(false);
  const isLogin = location.pathname.startsWith("/hisab/login");

  React.useEffect(() => {
    if (status === "out" && !isLogin) navigate({ to: "/hisab/login", replace: true });
    if (status === "in" && isLogin) navigate({ to: "/hisab", replace: true });
  }, [status, isLogin, navigate]);

  // পাতা বদলালে ড্রয়ার বন্ধ
  React.useEffect(() => setDrawer(false), [location.pathname]);

  if (status === "checking") {
    return (
      <div className="grid min-h-screen place-items-center bg-bg">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (isLogin || status === "out") {
    return (
      <div className="min-h-screen bg-bg">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* ডেস্কটপে স্থির সাইডবার */}
      <aside className="hb-chrome fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-line bg-panel lg:block">
        <SidebarBody pathname={location.pathname} userName={userName} />
      </aside>

      {/* ফোনে ড্রয়ার */}
      {drawer ? (
        <div className="hb-chrome fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawer(false)}
            aria-label="বন্ধ করুন"
          />
          <aside className="absolute inset-y-0 left-0 w-[268px] border-r border-line bg-panel">
            <button
              onClick={() => setDrawer(false)}
              className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg text-dim hover:bg-card-2"
              aria-label="বন্ধ করুন"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarBody pathname={location.pathname} userName={userName} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[248px]">
        <TopBar
          title={pageTitle(location.pathname)}
          userName={userName}
          onMenu={() => setDrawer(true)}
        />
        <main className="mx-auto w-full max-w-6xl px-3 py-4 pb-28 sm:px-5 lg:pb-8">
          <Outlet />
        </main>
      </div>

      <BottomNav pathname={location.pathname} />
    </div>
  );
}

/* ---------------------------- সাইডবার ---------------------------- */

function SidebarBody({ pathname, userName }: { pathname: string; userName: string }) {
  return (
    <div className="flex h-full flex-col">
      {/* লোগো */}
      <Link to="/hisab" className="flex items-center gap-2.5 px-4 py-4">
        <span className="hb-grad grid h-10 w-10 place-items-center rounded-xl text-[17px] font-black text-white">
          হি
        </span>
        <span className="leading-tight">
          <span className="block text-[15px] font-black text-ink">হিসাব</span>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.14em] text-faint">
            খাতা ও গুদাম
          </span>
        </span>
      </Link>

      {/* দ্রুত বিক্রয় */}
      <div className="px-3 pb-2">
        <Link
          to="/hisab/new"
          search={{ type: "sale" }}
          className="hb-grad flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-[13.5px] font-bold text-white shadow-lg shadow-brand/25 transition hover:opacity-90"
        >
          <Zap className="h-4 w-4" />
          দ্রুত বিক্রয়
          <ChevronRight className="ml-auto h-4 w-4 opacity-80" />
        </Link>
      </div>

      {/* নেভ */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mt-3">
            <p className="mb-1.5 flex items-center gap-1.5 px-2 text-[9.5px] font-bold uppercase tracking-[0.13em] text-faint">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: group.dot }} />
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-2 py-2 text-[13px] font-semibold transition",
                      active ? "bg-card-2 text-ink" : "text-dim hover:bg-card-2/60 hover:text-ink",
                    )}
                  >
                    <IconTile tone={item.tone} size={28}>
                      <item.icon className="h-3.5 w-3.5" />
                    </IconTile>
                    {item.label}
                    {active ? <span className="hb-grad ml-auto h-4 w-1 rounded-full" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* নিচে ব্যবহারকারী */}
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-card-2 p-2.5">
          <Avatar name={userName} size={34} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[12.5px] font-bold text-ink">{userName}</span>
            <span className="block text-[10px] text-faint">এই এন্ট্রিগুলো আপনার নামে</span>
          </span>
          <button
            onClick={() => hisabLogout()}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-dim transition hover:bg-rose/15 hover:text-rose"
            aria-label="লগআউট"
            title="লগআউট"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- উপরের বার ---------------------------- */

const QUICK_ADD: {
  to: string;
  search?: { type: string };
  label: string;
  icon: typeof Plus;
  tone: Tone;
}[] = [
  { to: "/hisab/new", search: { type: "sale" }, label: "বিক্রয়", icon: ShoppingCart, tone: "sky" },
  { to: "/hisab/new", search: { type: "purchase" }, label: "ক্রয়", icon: Package, tone: "mint" },
  { to: "/hisab/new", search: { type: "expense" }, label: "খরচ", icon: Receipt, tone: "amber" },
  { to: "/hisab/products", label: "নতুন পণ্য", icon: Boxes, tone: "violet" },
  { to: "/hisab/parties", label: "বাকির খাতা", icon: Wallet, tone: "rose" },
];

function TopBar({
  title,
  userName,
  onMenu,
}: {
  title: string;
  userName: string;
  onMenu: () => void;
}) {
  const [theme, setTheme] = React.useState<Theme>("dark");
  const [quickOpen, setQuickOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => setTheme(readTheme()), []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <header className="hb-chrome sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-3 py-3 sm:px-5">
        <button
          onClick={onMenu}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line text-dim transition hover:text-ink lg:hidden"
          aria-label="মেনু"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-[15px] font-bold text-ink">{title}</h1>
          <p className="hidden text-[11px] text-faint sm:block">{bnDateLong(new Date())}</p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* দ্রুত যোগ */}
          <div className="relative">
            <button
              onClick={() => {
                setQuickOpen((v) => !v);
                setMenuOpen(false);
              }}
              className="hb-grad flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold text-white shadow-lg shadow-brand/25"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">দ্রুত যোগ</span>
            </button>
            {quickOpen ? (
              <>
                <button
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setQuickOpen(false)}
                  aria-label="বন্ধ"
                />
                <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-line bg-card p-1.5 shadow-2xl">
                  {QUICK_ADD.map((q) => (
                    <Link
                      key={q.label}
                      to={q.to}
                      search={q.search as never}
                      onClick={() => setQuickOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-[13px] font-semibold text-dim transition hover:bg-card-2 hover:text-ink"
                    >
                      <IconTile tone={q.tone} size={28}>
                        <q.icon className="h-3.5 w-3.5" />
                      </IconTile>
                      {q.label}
                    </Link>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <button
            onClick={toggleTheme}
            className="grid h-9 w-9 place-items-center rounded-xl border border-line text-dim transition hover:text-ink"
            aria-label={theme === "dark" ? "আলো থিম" : "গাঢ় থিম"}
            title={theme === "dark" ? "আলো থিম" : "গাঢ় থিম"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <Link
            to="/hisab/list"
            search={{ due: true }}
            className="relative grid h-9 w-9 place-items-center rounded-xl border border-line text-dim transition hover:text-ink"
            aria-label="বাকির তালিকা"
            title="যেসব হিসাবে বাকি আছে"
          >
            <Bell className="h-4 w-4" />
          </Link>

          {/* প্রোফাইল */}
          <div className="relative">
            <button
              onClick={() => {
                setMenuOpen((v) => !v);
                setQuickOpen(false);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-line py-1 pl-1 pr-2 transition hover:bg-card-2"
              aria-label="প্রোফাইল"
            >
              <Avatar name={userName} size={26} />
              <span className="hidden text-[12px] font-bold text-ink sm:inline">{userName}</span>
            </button>
            {menuOpen ? (
              <>
                <button
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setMenuOpen(false)}
                  aria-label="বন্ধ"
                />
                <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-line bg-card p-1.5 shadow-2xl">
                  <Link
                    to="/hisab/more"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-dim transition hover:bg-card-2 hover:text-ink"
                  >
                    <Settings className="h-4 w-4" />
                    সব পাতা
                  </Link>
                  <Link
                    to="/hisab/help"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-dim transition hover:bg-card-2 hover:text-ink"
                  >
                    <HelpCircle className="h-4 w-4" />
                    সাহায্য
                  </Link>
                  <button
                    onClick={() => hisabLogout()}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-rose transition hover:bg-rose/10"
                  >
                    <LogOut className="h-4 w-4" />
                    লগআউট
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

/* ---------------------------- নিচের বার (ফোন) ---------------------------- */

function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav className="hb-chrome fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid w-full max-w-lg grid-cols-5 items-end px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5">
        {BOTTOM_NAV.slice(0, 2).map((item) => (
          <NavButton key={item.to} item={item} pathname={pathname} />
        ))}

        <div className="flex justify-center">
          <Link
            to="/hisab/new"
            search={{ type: "sale" }}
            className="hb-grad -mt-6 grid h-14 w-14 place-items-center rounded-2xl text-white shadow-xl shadow-brand/35 transition active:scale-95"
            aria-label="নতুন হিসাব"
          >
            <Plus className="h-7 w-7" />
          </Link>
        </div>

        {BOTTOM_NAV.slice(2).map((item) => (
          <NavButton key={item.to} item={item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

function NavButton({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-bold transition",
        active ? "text-ink" : "text-faint",
      )}
    >
      <Icon
        className="h-5 w-5"
        strokeWidth={active ? 2.4 : 2}
        style={active ? { color: "var(--brand-2)" } : undefined}
      />
      {item.label}
    </Link>
  );
}
