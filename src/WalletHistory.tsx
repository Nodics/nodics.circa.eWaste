import { useState, type ReactNode } from "react";
import { ListingPagination } from "./components/listing/ListingControls";

/** Pages only the returned snapshot; owner APIs do not expose ledger continuation. */
export function WalletHistory<T>({
  entries,
  children,
}: {
  entries: T[];
  children: (visible: T[]) => ReactNode;
}) {
  const [selection, setSelection] = useState({ entries, page: 1 });
  const pageSize = 10;
  const page = selection.entries === entries ? selection.page : 1;
  return (
    <section aria-label="Recent transaction history">
      <h2>Recent transactions</h2>
      <p>
        {entries.length} recent transactions available. Older transactions may
        not be included.
      </p>
      {children(entries.slice((page - 1) * pageSize, page * pageSize))}
      {!entries.length && <p>No recent transactions returned.</p>}
      <ListingPagination
        page={page}
        pageSize={pageSize}
        total={entries.length}
        busy={false}
        onPage={(next) => setSelection({ entries, page: next })}
        copy={(key, fallback) =>
          key === "pagination" ? "Recent transaction pages" : fallback
        }
      />
    </section>
  );
}
