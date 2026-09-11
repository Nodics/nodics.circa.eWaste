import { ArrowUpRight, Coins, Leaf, Wallet as WalletIcon } from "lucide-react";
import type { Wallet } from "./api";
import { HeaderPopover } from "./HeaderPopover";

/** Displays balances and ledger entries supplied by the Loyalty-owned wallet API. */
export function CustomerWallet({ wallet }: { wallet: Wallet }) {
  return (
    <>
      <div className="wallet-cards">
        {[
          { code: "points", label: "Reward points", Icon: Coins },
          { code: "circaCarbon", label: "Carbon units", Icon: Leaf },
        ].map(({ code, label, Icon }) => {
          const balance = wallet.balances.find(
            (item) => item.rewardTypeCode === code,
          );
          return (
            <article
              key={code}
              className={code === "points" ? "points" : "carbon"}
            >
              <Icon size={26} />
              <h2>{label}</h2>
              <strong>{balance?.available ?? 0}</strong>
              <p>Available · {balance?.reserved ?? 0} held</p>
            </article>
          );
        })}
      </div>
      <p className="sample-note">
        Carbon units are rewards. They are separate from CO₂e savings and are
        not issued carbon credits.
      </p>
      <h2>Recent transactions</h2>
      <div className="ledger">
        {wallet.entries.map((entry) => (
          <div key={entry.code}>
            <span className="ledger-icon">
              {entry.rewardTypeCode === "points" ? (
                <Coins size={20} />
              ) : (
                <Leaf size={20} />
              )}
            </span>
            <span>
              <strong>
                {entry.entryType.replaceAll("_", " ").toLowerCase()}
              </strong>
              <small>
                {entry.sourceCode} ·{" "}
                {new Date(entry.postedAt).toLocaleDateString("en-GB")}
              </small>
            </span>
            <span>
              <strong>{entry.amount}</strong>
              <small>
                {entry.rewardTypeCode === "points" ? "points" : "carbon units"}
              </small>
            </span>
          </div>
        ))}
        {!wallet.entries.length && (
          <p>
            Your first transaction will appear here after approval or a
            purchase.
          </p>
        )}
      </div>
    </>
  );
}

export function HeaderWallet({
  wallet,
  error,
  onRefresh,
}: {
  wallet: Wallet | null;
  error: string;
  onRefresh: () => void;
}) {
  return (
    <HeaderPopover
      href="/account/wallet"
      label="Wallet"
      title="Your wallet"
      icon={<WalletIcon size={21} />}
    >
      {(close) => (
        <>
          {error ? (
            <div role="alert">
              <p>{error}</p>
              <button className="secondary" onClick={onRefresh}>
                Retry
              </button>
            </div>
          ) : !wallet ? (
            <p role="status">Loading your wallet…</p>
          ) : (
            <>
              <div className="header-wallet-balances">
                {[
                  { code: "points", label: "Reward points", Icon: Coins },
                  { code: "circaCarbon", label: "Carbon units", Icon: Leaf },
                ].map(({ code, label, Icon }) => {
                  const balance = wallet.balances.find(
                    (item) => item.rewardTypeCode === code,
                  );
                  return (
                    <div className="header-wallet-balance" key={code}>
                      <Icon size={24} />
                      <div>
                        <small>{label}</small>
                        <strong>{balance?.available ?? 0}</strong>
                        <small>Available · {balance?.reserved ?? 0} held</small>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="header-wallet-note">
                Carbon units are rewards. They are separate from CO₂e savings
                and are not issued carbon credits.
              </p>
            </>
          )}
          <a
            className="header-wallet-link"
            href="/account/wallet"
            onClick={close}
          >
            Open wallet <ArrowUpRight size={17} />
          </a>
        </>
      )}
    </HeaderPopover>
  );
}
