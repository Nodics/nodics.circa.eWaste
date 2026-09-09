import { useEffect, useState } from "react";
import { request, type Session } from "./api";
type Message = { code: string; title: string; body: string; createdAt: string };
/** Displays the authenticated customer's Communication-owned persistent inbox. */
export function OutcomeInbox({ session }: { session: Session }) {
  const [messages, setMessages] = useState<Message[]>([]),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setMessages([]);
    setError("");
    void request<Message[]>(
      "/nodics/commsApi/v0/customer/communications",
      session,
    )
      .then((data) => {
        if (active) setMessages(data);
      })
      .catch(() => {
        if (active)
          setError(
            "Updates could not be loaded. Your submission history remains available.",
          );
      });
    return () => {
      active = false;
    };
  }, [session.token, reload]);
  return (
    <section aria-label="Review updates" className="account-inbox">
      <h2>Review updates</h2>
      {error ? (
        <p role="status">{error}</p>
      ) : messages.length ? (
        messages.map((message) => (
          <article key={message.code}>
            <h3>{message.title}</h3>
            <p style={{ whiteSpace: "pre-wrap" }}>{message.body}</p>
            <time dateTime={message.createdAt}>
              {new Date(message.createdAt).toLocaleString()}
            </time>
          </article>
        ))
      ) : (
        <p>Your review notifications will appear here.</p>
      )}
      <button
        className="secondary"
        onClick={() => setReload((value) => value + 1)}
      >
        Refresh updates
      </button>
    </section>
  );
}
