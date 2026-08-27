import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { nameFromEmail } from "@/lib/hisab/auth";

type SessionState = {
  status: "checking" | "out" | "in";
  userId: string | null;
  userName: string;
  refresh: () => void;
};

const Ctx = React.createContext<SessionState>({
  status: "checking",
  userId: null,
  userName: "",
  refresh: () => {},
});

export function useHisabSession() {
  return React.useContext(Ctx);
}

export function HisabSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<Omit<SessionState, "refresh">>({
    status: "checking",
    userId: null,
    userName: "",
  });

  const apply = React.useCallback((user: { id: string; email?: string } | null) => {
    setState(
      user
        ? { status: "in", userId: user.id, userName: nameFromEmail(user.email) }
        : { status: "out", userId: null, userName: "" },
    );
  }, []);

  const refresh = React.useCallback(() => {
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user ?? null));
  }, [apply]);

  React.useEffect(() => {
    refresh();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [apply, refresh]);

  const value = React.useMemo(() => ({ ...state, refresh }), [state, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
