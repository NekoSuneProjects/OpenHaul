"use client";

import { useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export function ClientStatus() {
  const [state, setState] = useState<"unknown" | "online" | "offline">("unknown");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(api + "/api/v1/account/dashboard", {
          credentials: "include",
          cache: "no-store",
        });
        if (!active) return;
        if (response.status === 401) {
          setState("unknown");
          return;
        }
        if (!response.ok) {
          setState("offline");
          return;
        }
        const data = await response.json();
        setState(data.live ? "online" : "offline");
      } catch {
        if (active) setState("offline");
      }
    };
    void load();
    const timer = setInterval(load, 15_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  if (state === "unknown") return null;
  return <span className={"clientStatus " + state}>Client {state.toUpperCase()}</span>;
}
