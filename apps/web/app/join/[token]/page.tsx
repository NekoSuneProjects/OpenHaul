"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

type InviteDetails = {
  vtc: { id: number; name: string; slug: string; tag?: string | null };
  expiresAt: string;
};

export default function JoinVtcPage() {
  const params = useParams<{ token: string }>();
  const token = useMemo(() => String(params.token), [params.token]);
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [status, setStatus] = useState("Checking invite…");
  const [joinedVtcId, setJoinedVtcId] = useState<number | null>(null);

  useEffect(() => {
    fetch(api + "/api/v1/public/vtc-invites/" + encodeURIComponent(token), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((data) => {
        setInvite(data);
        setStatus("");
      })
      .catch(() => setStatus("This invite is invalid, expired, already used, or revoked."));
  }, [token]);

  const accept = async () => {
    setStatus("Joining VTC…");
    const response = await fetch(api + "/api/v1/account/vtc-invites/" + encodeURIComponent(token) + "/accept", {
      method: "POST",
      credentials: "include",
    });
    if (response.status === 401) {
      const returnPath = encodeURIComponent(window.location.pathname);
      window.location.href = api + "/api/v1/auth/steam?return=" + returnPath;
      return;
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus(result?.error === "already_member" ? "You are already a member of this VTC." : "Unable to accept this invite.");
      return;
    }
    setJoinedVtcId(result.vtcId);
    setStatus("You joined " + (invite?.vtc.name ?? "the VTC") + ".");
  };

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">VTC invitation</span>
        <h1>{invite?.vtc.name ?? "Join a VTC"}</h1>
        <p className="lede">
          {status || `You were invited to join ${invite?.vtc.tag ? "[" + invite.vtc.tag + "] " : ""}${invite?.vtc.name}.`}
        </p>
        <div className="actions">
          {invite && !joinedVtcId ? <button className="button primary" onClick={() => void accept()}>Accept invite</button> : null}
          {joinedVtcId ? <Link className="button primary" href={"/vtc/" + joinedVtcId}>Open VTC</Link> : null}
          <Link className="button" href="/vtcs">Browse VTCs</Link>
        </div>
      </section>
    </main>
  );
}
