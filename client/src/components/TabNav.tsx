import { NavLink } from "react-router-dom";
import { Home, Video, Bell, BarChart3 } from "lucide-react";

const tabs = [
  { to: "/", label: "home", icon: Home, end: true },
  { to: "/live", label: "live feed", icon: Video },
  { to: "/alerts", label: "alerts history", icon: Bell },
  { to: "/stats", label: "model stats", icon: BarChart3 },
];

export default function TabNav() {
  return (
    <nav className="flex gap-1 px-6 py-3.5 bg-[#050608] border-b border-[#132227]">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded text-sm font-mono tracking-wide transition-colors ${
              isActive ? "bg-[#0f2226] text-[#4de8f5]" : "text-[#6b7d82] hover:text-[#a9bcc2]"
            }`
          }
        >
          <tab.icon size={16} />
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
