import { useEffect, useState } from "react";
import { MdDelete } from "react-icons/md";
import { FaWhatsapp } from "react-icons/fa";
import { LuGripVertical } from "react-icons/lu";

const SIDEBAR_WIDTH = 120;

const reorderAccounts = (accounts: number[], fromId: number, toId: number) => {
  if (fromId === toId) {
    return accounts;
  }

  const next = [...accounts];
  const fromIndex = next.indexOf(fromId);
  const toIndex = next.indexOf(toId);

  if (fromIndex === -1 || toIndex === -1) {
    return accounts;
  }

  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

declare global {
  interface Window {
    electronAPI: {
      openWhatsApp: (id: number) => void;
      closeWhatsApp: (id: number) => Promise<void>;
      getSessions: () => Promise<number[]>;
      reorderSessions: (ids: number[]) => Promise<number[]>;
      setDeleteModalOpen: (isOpen: boolean) => Promise<void>;
    };
  }
}

export default function App() {
  const [accounts, setAccounts] = useState<number[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  useEffect(() => {
    void window.electronAPI.setDeleteModalOpen(pendingDeleteId !== null);
  }, [pendingDeleteId]);

  const switchAccount = (id: number) => {
    setActiveId(id);
    window.electronAPI.openWhatsApp(id);
  };

  const persistOrder = (nextAccounts: number[]) => {
    setAccounts(nextAccounts);
    void window.electronAPI.reorderSessions(nextAccounts);
  };

  const addAccount = () => {
    const nextId = accounts.length > 0 ? Math.max(...accounts) + 1 : 1;
    const nextAccounts = [...accounts, nextId];
    setAccounts(nextAccounts);
    setActiveId(nextId);
    window.electronAPI.openWhatsApp(nextId);
    void window.electronAPI.reorderSessions(nextAccounts);
  };

  const removeAccount = async (id: number) => {
    setIsDeleting(true);

    try {
      const updated = accounts.filter((acc) => acc !== id);
      setAccounts(updated);
      await window.electronAPI.closeWhatsApp(id);

      if (activeId !== id) {
        return;
      }

      const nextActiveId = updated[0] ?? null;
      setActiveId(nextActiveId);

      if (nextActiveId !== null) {
        window.electronAPI.openWhatsApp(nextActiveId);
      }
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  };

  const handleDrop = (targetId: number) => {
    if (draggedId === null) {
      return;
    }

    const nextAccounts = reorderAccounts(accounts, draggedId, targetId);
    setDraggedId(null);

    if (nextAccounts !== accounts) {
      persistOrder(nextAccounts);
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
                  draggable
                  onDragStart={() => setDraggedId(id)}
                  onDragEnd={() => setDraggedId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(id)}
                  className={`group flex items-center justify-between rounded-2xl border px-2 py-2 transition-all duration-200 ${
                    activeId === id
                      ? "border-success/40 bg-success/10 shadow-sm"
                      : "border-base-300/70 bg-base-200/55 hover:border-base-content/15 hover:bg-base-200"
                  } ${
                    draggedId === id ? "opacity-60" : ""
                  }`}>
                  <div className="flex cursor-grab items-center px-1 text-base-content/25">
                    <LuGripVertical className="h-4 w-4" />
                  </div>
                  <button
                    onClick={() => switchAccount(id)}
                    className={`flex h-5 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl transition-colors duration-150 ${
                      activeId === id
                        ? "text-success"
                        : "text-base-content/70 group-hover:text-base-content"
                    }`}>
                    <FaWhatsapp className="h-4 w-4" />
                    <span className="text-xs font-semibold">#{id}</span>
                  </button>
                  <button
                    onClick={() => setPendingDeleteId(id)}
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

      {pendingDeleteId !== null ? (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-sm rounded-3xl border border-base-300/70 bg-base-100 shadow-xl">
            <h3 className="text-lg font-semibold text-base-content">
              Remove session?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-base-content/70">
              This will remove account #{pendingDeleteId} from the app and clear
              its stored WhatsApp session data on this device.
            </p>
            <div className="modal-action mt-6">
              <button
                onClick={() => setPendingDeleteId(null)}
                className="btn btn-ghost rounded-2xl"
                disabled={isDeleting}>
                Cancel
              </button>
              <button
                onClick={() => void removeAccount(pendingDeleteId)}
                className="btn btn-error rounded-2xl text-error-content"
                disabled={isDeleting}>
                {isDeleting ? "Removing..." : "Yes, remove"}
              </button>
            </div>
          </div>
          <button
            className="modal-backdrop cursor-pointer"
            onClick={() => {
              if (!isDeleting) {
                setPendingDeleteId(null);
              }
            }}>
            close
          </button>
        </dialog>
      ) : null}
    </div>
  );
}
