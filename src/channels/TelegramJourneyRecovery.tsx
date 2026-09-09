import { useEffect, useState } from "react";
import { API, request, type Session } from "../api";

type SavedItem = {
  code: string;
  name: string;
  status: string;
  updated?: string;
};
type Recovery = {
  drafts: { items: SavedItem[]; total: number; page: number; pageSize: number };
  latestSubmission: SavedItem | null;
};

/** Restores an owner-scoped server journey after a Mini App window closes; multiple drafts require the customer's choice. */
export function TelegramJourneyRecovery({
  session,
  onResume,
}: {
  session: Session;
  onResume: (code?: string) => void;
}) {
  const [page, setPage] = useState(1),
    [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<Recovery | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    void request<Recovery>(`${API}/journey/resume?page=${page}`, session)
      .then((result) => {
        if (!active) return;
        if (result.drafts.total === 0) onResume(result.latestSubmission?.code);
        else if (result.drafts.total === 1 && result.drafts.items[0])
          onResume(result.drafts.items[0].code);
        else setData(result);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "I couldn’t load your saved journey.",
          );
      });
    return () => {
      active = false;
    };
  }, [session.token, page, attempt, onResume]);
  return (
    <section className="telegram-onboarding" aria-label="Your saved journey">
      <div className="onboarding-message">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="text-button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try loading again
            </button>
          </>
        ) : !data ? (
          <p role="status">
            You’re connected. Let me check where you left off…
          </p>
        ) : (
          <>
            <p>
              You have a few saved items. Which one would you like to continue?
            </p>
            {data.drafts.items.map((item) => (
              <button
                key={item.code}
                className="secondary full"
                onClick={() => onResume(item.code)}
              >
                {item.name}
                <small>{item.code}</small>
              </button>
            ))}
            <div className="journey-photo-actions">
              {page > 1 && (
                <button
                  className="text-button"
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous items
                </button>
              )}
              {page * data.drafts.pageSize < data.drafts.total && (
                <button
                  className="text-button"
                  onClick={() => setPage((value) => value + 1)}
                >
                  More saved items
                </button>
              )}
            </div>
            <button className="text-button" onClick={() => onResume()}>
              Start a new submission
            </button>
          </>
        )}
      </div>
    </section>
  );
}
