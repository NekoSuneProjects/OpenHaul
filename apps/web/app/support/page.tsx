"use client";

import { useEffect, useState } from "react";

type Goal = {
  id: number;
  title: string;
  description?: string | null;
  currency: string;
  targetAmount: string | number;
  currentAmount: string | number;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

function money(currency: string, value: number) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export default function SupportPage() {
  const [enabled, setEnabled] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    fetch(`${api}/api/v1/public/donation-goals`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setEnabled(Boolean(data.enabled));
        setGoals(data.goals ?? []);
      })
      .catch(() => {});
  }, []);

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 20 }}>
        <span className="eyebrow">Community support</span>
        <h1 style={{ fontSize: "clamp(2.6rem,6vw,4.8rem)" }}>Help OpenHaul grow.</h1>
        <p className="lede">
          Funding goals can be used by a self-hosted OpenHaul instance for DLC, convoy costs, hosting or community projects.
          Payment providers are deliberately separate from the goal tracker.
        </p>
      </section>

      {!enabled && <div className="card"><h3>Support goals are disabled</h3><p>The administrator has not enabled donations on this OpenHaul instance.</p></div>}

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        {enabled && goals.map((goal) => {
          const current = Number(goal.currentAmount);
          const target = Number(goal.targetAmount);
          const percent = Math.max(0, Math.min(100, target > 0 ? (current / target) * 100 : 0));

          return (
            <article className="card" key={goal.id}>
              <h3>{goal.title}</h3>
              <p>{goal.description ?? "OpenHaul community funding goal."}</p>
              <div style={{ marginTop: 20, height: 10, borderRadius: 99, background: "#06110c", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${percent}%`, background: "var(--accent)" }} />
              </div>
              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>{money(goal.currency, current)}</strong>
                <span className="muted">of {money(goal.currency, target)}</span>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
