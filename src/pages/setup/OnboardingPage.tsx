import { useNavigate } from "react-router-dom";
import { Database, Store, Wifi } from "lucide-react";

export function OnboardingPage() {
  const navigate = useNavigate();
  const cards = [
    {
      icon: Store,
      title: "New shop",
      hint: "Start a fresh shop on this computer. This PC becomes the main server.",
      to: "/login",
    },
    {
      icon: Database,
      title: "Restore backup",
      hint: "Load customers, stock, and bills from a saved file.",
      to: "/login",
    },
    {
      icon: Wifi,
      title: "Join this shop",
      hint: "Find the main PC on Wi‑Fi. Same customers, same stock. Do not set up a new POS.",
      to: "/login",
    },
  ];

  return (
    <div className="grid h-full place-items-center bg-slate-950 p-8">
      <div className="w-full max-w-3xl">
        <p className="text-[12px] font-semibold uppercase tracking-widest text-teal-400">POS</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Set up this computer</h1>
        <p className="mt-1 text-slate-400">Three choices. Nothing extra.</p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.title}
                onClick={() => navigate(card.to)}
                className="rounded-lg border border-white/10 bg-white/5 p-4 text-left text-slate-200 hover:border-teal-500 hover:bg-white/10"
              >
                <Icon size={18} className="text-teal-400" />
                <p className="mt-3 font-semibold text-white">{card.title}</p>
                <p className="mt-1 text-[12px] leading-5 text-slate-400">{card.hint}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
