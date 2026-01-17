import { useEffect, useState } from "react";
import { MdDelete } from "react-icons/md";
import { FaWhatsapp } from "react-icons/fa";

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
    setAccounts([...accounts, nextId]);
    setActiveId(nextId);
    window.electronAPI.openWhatsApp(nextId);
  };

  const removeAccount = (id: number) => {
    const updated = accounts.filter((acc) => acc !== id);
    setAccounts(updated);
    window.electronAPI.closeWhatsApp(id);
  };

  return (
    <div className="drawer drawer-open">
      <input id="my-drawer-1" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content">
        {/* WhatsApp view render target */}
        <div id="pageContentHere" className="h-full w-full" />
      </div>
      <div className="drawer-side">
        <label
          htmlFor="my-drawer-1"
          aria-label="close sidebar"
          className="drawer-overlay"></label>
        <div className="w-30 min-h-full bg-base-100 p-4 flex flex-col justify-between">
          <div>
            <h2 className="text-xs uppercase tracking-widest mb-3 text-slate-400">
              Cuentas
            </h2>
            <div className="flex flex-col gap-2">
              {accounts.map((id) => (
                <div
                  key={id}
                  className={`rounded-xl shadow-md flex overflow-hidden border border-slate-600/20 transition-all duration-200 ${
                    activeId === id
                      ? "shadow-green-400/40"
                      : "shadow-slate-900/20"
                  }`}>
                  <button
                    onClick={() => switchAccount(id)}
                    className={`w-11 h-11 flex items-center justify-center text-slate-200 transition-colors duration-150 ${
                      activeId === id
                        ? "bg-green-900"
                        : "bg-slate-900 hover:bg-slate-800"
                    }`}>
                    <div className="relative">
                      <FaWhatsapp className="w-5 h-5" />
                      <span className="absolute -top-1.5 -right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-slate-900 shadow text-zinc-900 bg-green-400">
                        {id}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => removeAccount(id)}
                    className="w-11 h-11 flex items-center justify-center text-slate-200 bg-red-900 hover:bg-red-700 border-l border-slate-800"
                    title="Eliminar">
                    <MdDelete className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={addAccount}
            className="mt-3 text-sm font-semibold tracking-wide rounded-xl bg-gradient-to-r from-green-600 to-green-400 text-zinc-900 px-3 py-2 hover:brightness-110 transition">
            + Añadir
          </button>
        </div>
      </div>
    </div>
  );
}
