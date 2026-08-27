import { createFileRoute, redirect } from "@tanstack/react-router";

// অ্যাপটা /hisab-এ থাকে; মূল ঠিকানা সেখানেই পাঠিয়ে দেয়।
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/hisab" });
  },
});
