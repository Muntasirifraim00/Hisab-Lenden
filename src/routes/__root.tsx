import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { THEME_BOOT_SCRIPT } from "@/lib/hisab/theme";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "হিসাব — দোকানের খাতা ও গুদাম" },
      {
        name: "description",
        content: "দোকানের খাতা আর গুদাম এক জায়গায় — স্টক, লাভ, বাকি ও কিস্তির হিসাব।",
      },
      { name: "robots", content: "noindex, nofollow" },
      { name: "theme-color", content: "#132a6b" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
    // পাতা আঁকার আগেই থিম বসে যায়, নইলে এক ঝলক সাদা দেখা যেত
    scripts: [{ children: THEME_BOOT_SCRIPT }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorScreen,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" data-theme="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}

function NotFound() {
  return (
    <Centered
      title="পাতাটি নেই"
      body="যে ঠিকানায় যেতে চাইছেন সেটা খুঁজে পাওয়া গেল না।"
      action={
        <Link
          to="/hisab"
          className="hb-grad inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
        >
          হিসাবে ফিরুন
        </Link>
      }
    />
  );
}

function ErrorScreen({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);

  return (
    <Centered
      title="কিছু একটা গোলমাল হয়েছে"
      body={error.message || "পাতাটি লোড করা গেল না।"}
      action={
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="hb-grad inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
        >
          আবার চেষ্টা করুন
        </button>
      }
    />
  );
}

function Centered({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-dim">{body}</p>
        <div className="mt-6">{action}</div>
      </div>
    </div>
  );
}
