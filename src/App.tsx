import { useEffect, useState } from "react";
import { MdDelete } from "react-icons/md";
import { FaWhatsapp } from "react-icons/fa";

const SIDEBAR_WIDTH = 120;

declare global {
  interface Window {
    electronAPI: {
      openWhatsApp: (id: number) => void;
      closeWhatsApp: (id: number) => void;
      getSessions: () => Promise<number[]>;
    };
  }
}

export default function App() {
  const [accounts, setAccounts] = useState<number[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  useEffect(() => {
    const loadFromMain = async () => {
      try {
        const ids = await window.electronAPI.getSessions();

        if (Array.isArray(ids) && ids.length > 0) {
          setAccounts(ids);
          setActiveId(ids[0]);
          window.electronAPI.openWhatsApp(ids[0]);
        }
      } catch (err) {
        console.error("Error loading sessions from main:", err);
      }
    };

    loadFromMain();
  }, []);

  const switchAccount = (id: number) => {
    setActiveId(id);
    window.electronAPI.openWhatsApp(id);
  };

  const addAccount = () => {
    const nextId = accounts.length > 0 ? Math.max(...accounts) + 1 : 1;
    setAccounts((current) => [...current, nextId]);
    setActiveId(nextId);
    window.electronAPI.openWhatsApp(nextId);
  };

  const removeAccount = (id: number) => {
    const updated = accounts.filter((acc) => acc !== id);
    setAccounts(updated);
    window.electronAPI.closeWhatsApp(id);

    if (activeId !== id) {
      return;
    }

    const nextActiveId = updated[0] ?? null;
    setActiveId(nextActiveId);

    if (nextActiveId !== null) {
      window.electronAPI.openWhatsApp(nextActiveId);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside
        className="flex h-full shrink-0 flex-col border-r border-base-300/60 bg-base-100/95 px-3 py-4 backdrop-blur"
        style={{ width: `${SIDEBAR_WIDTH}px` }}>
        <div className="mb-4 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-success/20 bg-success/10 text-success shadow-sm">
            <FaWhatsapp className="h-5 w-5" />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-base-content/45">
              Accounts
            </p>
            <p className="mt-1 text-[11px] text-base-content/55">
              {accounts.length} active
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
            {accounts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-base-300/80 bg-base-200/50 px-3 py-4 text-center text-[11px] leading-relaxed text-base-content/50">
                Add an account to get started.
              </div>
            ) : (
              accounts.map((id) => (
                <div
                  key={id}
                  className={`group flex items-center justify-between rounded-2xl border px-2 py-2 transition-all duration-200 ${
                    activeId === id
                      ? "border-success/40 bg-success/10 shadow-sm"
                      : "border-base-300/70 bg-base-200/55 hover:border-base-content/15 hover:bg-base-200"
                  }`}>
                  <button
                    onClick={() => switchAccount(id)}
                    className={`flex h-5 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl transition-colors duration-150 ${
                      activeId === id
                        ? "text-success"
                        : "text-base-content/70 group-hover:text-base-content"
                    }`}>
                    <FaWhatsapp className="h-4 w-4" />
                    <span className="text-xs font-semibold">#{id}</span>
                  </button>
                  <button
                    onClick={() => removeAccount(id)}
                    className="btn btn-ghost btn-xs h-8 min-h-8 w-8 cursor-pointer rounded-lg border-0 px-0 text-base-content/35 hover:bg-error/12 hover:text-error"
                    title="Remove">
                    <MdDelete className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <button
            onClick={addAccount}
            className="btn btn-success mt-3 cursor-pointer rounded-2xl text-sm font-semibold normal-case shadow-sm">
            New account
          </button>
        </div>
      </aside>

      <main className="h-full min-w-0 flex-1 bg-base-200/20">
        <div id="pageContentHere" className="h-full w-full" />
      </main>
    </div>
  );
}
