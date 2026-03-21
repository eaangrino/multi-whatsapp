import { useEffect, useState } from "react";
import { MdDelete } from "react-icons/md";
import { FaWhatsapp } from "react-icons/fa";
import {
  LuGripVertical,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPlus,
} from "react-icons/lu";
import { FiSettings } from "react-icons/fi";

const SIDEBAR_EXPANDED_WIDTH = 120;
const SIDEBAR_COMPACT_WIDTH = 72;
type AppView = "sessions" | "settings";
type SupportedPlatform = "linux" | "win32" | "darwin";

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
      setActiveViewVisible: (isVisible: boolean) => Promise<void>;
      getStartOnLogin: () => Promise<boolean>;
      setStartOnLogin: (enabled: boolean) => Promise<boolean>;
      setSidebarWidth: (width: number) => Promise<void>;
      getPlatform: () => Promise<SupportedPlatform>;
    };
  }
}

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>("sessions");
  const [accounts, setAccounts] = useState<number[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [startOnLogin, setStartOnLogin] = useState(false);
  const [isUpdatingStartOnLogin, setIsUpdatingStartOnLogin] = useState(false);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [platform, setPlatform] = useState<SupportedPlatform>("linux");

  useEffect(() => {
    const loadFromMain = async () => {
      try {
        const ids = await window.electronAPI.getSessions();
        const startOnLoginEnabled = await window.electronAPI.getStartOnLogin();
        const currentPlatform = await window.electronAPI.getPlatform();
        setPlatform(currentPlatform);
        setStartOnLogin(startOnLoginEnabled);

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
    const shouldShowBrowserView =
      currentView === "sessions" && pendingDeleteId === null;
    void window.electronAPI.setActiveViewVisible(shouldShowBrowserView);
  }, [currentView, pendingDeleteId]);

  useEffect(() => {
    const nextWidth = isSidebarCompact
      ? SIDEBAR_COMPACT_WIDTH
      : SIDEBAR_EXPANDED_WIDTH;
    void window.electronAPI.setSidebarWidth(nextWidth);
  }, [isSidebarCompact]);

  const switchAccount = (id: number) => {
    setCurrentView("sessions");
    setActiveId(id);
    window.electronAPI.openWhatsApp(id);
  };

  const persistOrder = (nextAccounts: number[]) => {
    setAccounts(nextAccounts);
    void window.electronAPI.reorderSessions(nextAccounts);
  };

  const handleStartOnLoginChange = async (enabled: boolean) => {
    setIsUpdatingStartOnLogin(true);

    try {
      const persistedValue = await window.electronAPI.setStartOnLogin(enabled);
      setStartOnLogin(persistedValue);
    } finally {
      setIsUpdatingStartOnLogin(false);
    }
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

  const platformLabel =
    platform === "win32" ? "Windows" : platform === "darwin" ? "macOS" : "Linux";

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside
        className="flex h-full shrink-0 flex-col border-r border-base-300/60 bg-base-100/95 px-3 py-4 backdrop-blur"
        style={{
          width: `${isSidebarCompact ? SIDEBAR_COMPACT_WIDTH : SIDEBAR_EXPANDED_WIDTH}px`,
        }}>
        {!isSidebarCompact ? (
          <div className="mb-4 flex items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-success/20 bg-success/10 text-success shadow-sm">
              <FaWhatsapp className="h-5 w-5" />
            </div>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          {!isSidebarCompact ? (
            <div className="mb-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-base-content/45">
                {currentView === "sessions" ? "Accounts" : "Settings"}
              </p>
              <p className="mt-1 text-[11px] text-base-content/55">
                {currentView === "sessions"
                  ? `${accounts.length} active`
                  : "Preferences"}
              </p>
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
            {currentView === "sessions" &&
            accounts.length === 0 &&
            !isSidebarCompact ? (
              <div className="rounded-2xl border border-dashed border-base-300/80 bg-base-200/50 px-3 py-4 text-center text-[11px] leading-relaxed text-base-content/50">
                Add an account to get started.
              </div>
            ) : currentView === "sessions" ? (
              accounts.map((id) => (
                <div
                  key={id}
                  draggable={!isSidebarCompact}
                  onDragStart={() => {
                    if (!isSidebarCompact) {
                      setDraggedId(id);
                    }
                  }}
                  onDragEnd={() => setDraggedId(null)}
                  onDragOver={(event) => {
                    if (!isSidebarCompact) {
                      event.preventDefault();
                    }
                  }}
                  onDrop={() => {
                    if (!isSidebarCompact) {
                      handleDrop(id);
                    }
                  }}
                  className={`group flex items-center rounded-2xl border px-2 py-2 transition-all duration-200 ${
                    activeId === id
                      ? "border-success/40 bg-success/10 shadow-sm"
                      : "border-base-300/70 bg-base-200/55 hover:border-base-content/15 hover:bg-base-200"
                  } ${
                    draggedId === id ? "opacity-60" : ""
                  }`}>
                  {!isSidebarCompact ? (
                    <div className="flex cursor-grab items-center px-1 text-base-content/25">
                      <LuGripVertical className="h-4 w-4" />
                    </div>
                  ) : null}
                  <button
                    onClick={() => switchAccount(id)}
                    title={`Account #${id}`}
                    className={`flex ${
                      isSidebarCompact ? "h-10 w-full" : "h-5 min-w-0 flex-1"
                    } cursor-pointer items-center justify-center gap-2 rounded-xl transition-colors duration-150 ${
                      activeId === id
                        ? "text-success"
                        : "text-base-content/70 group-hover:text-base-content"
                    }`}>
                    <FaWhatsapp className="h-4 w-4" />
                    {!isSidebarCompact ? (
                      <span className="text-xs font-semibold">#{id}</span>
                    ) : null}
                  </button>
                  {!isSidebarCompact ? (
                    <button
                      onClick={() => setPendingDeleteId(id)}
                      className="btn btn-ghost btn-xs h-8 min-h-8 w-8 cursor-pointer rounded-lg border-0 px-0 text-base-content/35 hover:bg-error/12 hover:text-error"
                      title="Remove">
                      <MdDelete className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))
            ) : null}
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {currentView === "sessions" ? (
              <button
                onClick={addAccount}
                title="New account"
                className="btn btn-success cursor-pointer rounded-2xl text-sm font-semibold normal-case shadow-sm">
                <LuPlus className="h-4 w-4" />
                {!isSidebarCompact ? "New account" : null}
              </button>
            ) : (
              <button
                onClick={() => setCurrentView("sessions")}
                title="Back to sessions"
                className="btn btn-ghost cursor-pointer rounded-2xl border border-base-300/70 bg-base-200/50 text-sm font-medium normal-case text-base-content/70 hover:border-success/25 hover:bg-success/8 hover:text-success">
                <FaWhatsapp className="h-4 w-4" />
                {!isSidebarCompact ? "Back to sessions" : null}
              </button>
            )}

            <button
              onClick={() => setCurrentView("settings")}
              title="Settings"
              className={`btn cursor-pointer rounded-2xl border text-sm font-medium normal-case shadow-none ${
                currentView === "settings"
                  ? "btn-success text-success-content"
                  : "btn-ghost border-base-300/70 bg-base-200/50 text-base-content/70 hover:border-success/25 hover:bg-success/8 hover:text-success"
              }`}>
              <FiSettings className="h-4 w-4" />
              {!isSidebarCompact ? "Settings" : null}
            </button>

            <button
              onClick={() => setIsSidebarCompact((current) => !current)}
              title={isSidebarCompact ? "Expand sidebar" : "Compact sidebar"}
              className="btn btn-ghost cursor-pointer rounded-2xl border border-base-300/70 bg-base-200/50 text-sm font-medium normal-case text-base-content/70 hover:border-success/25 hover:bg-success/8 hover:text-success">
              {isSidebarCompact ? (
                <LuPanelLeftOpen className="h-4 w-4" />
              ) : (
                <LuPanelLeftClose className="h-4 w-4" />
              )}
              {!isSidebarCompact
                ? "Compact sidebar"
                : null}
            </button>
          </div>
        </div>
      </aside>

      <main className="h-full min-w-0 flex-1 bg-base-200/20">
        {currentView === "sessions" ? (
          <div id="pageContentHere" className="h-full w-full" />
        ) : (
          <section className="flex h-full w-full items-center justify-center p-8">
            <div className="w-full max-w-2xl rounded-[2rem] border border-base-300/60 bg-base-100/90 p-8 shadow-xl backdrop-blur">
              <div className="mb-8">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-base-content/45">
                  Configuration
                </p>
                <h1 className="mt-3 text-3xl font-semibold text-base-content">
                  App settings
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-base-content/65">
                  Manage how Multi-WhatsApp behaves on this device.
                </p>
              </div>

              <div className="rounded-[1.75rem] border border-base-300/70 bg-base-200/55 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-base-content">
                      Start on login
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-base-content/65">
                      Launch the app automatically when your {platformLabel} session starts.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-success mt-1"
                    checked={startOnLogin}
                    disabled={isUpdatingStartOnLogin}
                    onChange={(event) =>
                      void handleStartOnLoginChange(event.target.checked)
                    }
                  />
                </div>
              </div>
            </div>
          </section>
        )}
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
