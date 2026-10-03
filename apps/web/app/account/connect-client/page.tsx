"use client";

import { useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function ConnectClientPage() {
  const [requestId, setRequestId] = useState("");
  const [user, setUser] = useState<any>(null);
  const [requestInfo, setRequestInfo] = useState<any>(null);
  const [status, setStatus] = useState("Loading…");
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("request") ?? "";
    setRequestId(id);

    if (!id) {
      setStatus("This Windows client login request is missing or invalid.");
      return;
    }

    void (async () => {
      const me = await fetch(api + "/api/v1/account/me", {
        credentials: "include",
        cache: "no-store",
      });

      if (me.status === 401) {
        setStatus("signin");
        return;
      }

      if (!me.ok) {
        setStatus("Unable to load your OpenHaul account.");
        return;
      }

      const meData = await me.json();
      setUser(meData.user);

      const info = await fetch(
        api + "/api/v1/account/client-auth/" + encodeURIComponent(id),
        { credentials: "include", cache: "no-store" },
      );

      if (!info.ok) {
        setStatus("This Windows client login request expired. Start sign-in again from the app.");
        return;
      }

      const data = await info.json();
      setRequestInfo(data);
      setApproved(Boolean(data.approved));
      setStatus("");
    })();
  }, []);

  const signIn = () => {
    const returnPath =
      "/account/connect-client?request=" + encodeURIComponent(requestId);
    window.location.href =
      api + "/api/v1/auth/steam?return=" + encodeURIComponent(returnPath);
  };

  const approve = async () => {
    setStatus("Connecting Windows client…");
    const response = await fetch(api + "/api/v1/account/client-auth/approve", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId }),
    });

    if (!response.ok) {
      setStatus("Unable to approve this Windows client. Start sign-in again from the app.");
      return;
    }

    setApproved(true);
    setStatus("");
  };

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">OpenHaul Windows Client</span>
        <h1>Connect this PC to your account.</h1>
        <p className="lede">
          The Windows app will receive its own revocable <code>oh_client_…</code> token.
          You never need to copy or paste the token manually.
        </p>

        {status === "signin" ? (
          <div className="actions">
            <button className="button primary" onClick={signIn}>Sign in with Steam</button>
          </div>
        ) : null}

        {user && requestInfo && !approved ? (
          <div className="card" style={{ marginTop: 20 }}>
            <h3>{requestInfo.clientName || "Windows Client"}</h3>
            <p>
              Connect as <strong>{user.displayName}</strong> · SteamID {user.steamId}
            </p>
            <p className="muted">
              Approving creates a new client token for this PC. You can revoke it later from your Account page.
            </p>
            <div className="actions">
              <button className="button primary" onClick={() => void approve()}>
                Approve Windows Client
              </button>
            </div>
          </div>
        ) : null}

        {approved ? (
          <div className="card" style={{ marginTop: 20 }}>
            <h3>✅ Windows client connected</h3>
            <p>You can close this browser tab and return to OpenHaul Client.</p>
          </div>
        ) : null}

        {status && status !== "signin" ? <p className="muted">{status}</p> : null}
      </section>
    </main>
  );
}
