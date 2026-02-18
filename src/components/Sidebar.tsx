import { NavLink } from "react-router-dom";
import { Home, Gamepad2, Bot, FlaskConical, Map, Navigation2 } from "lucide-react";
import React from "react";
import logo from "../assets/logos/quantum_logo.png";

const Sidebar: React.FC = () => {
  const links = [
    { to: "/", label: "Home", icon: <Home size={18} /> },
    { to: "/control", label: "Control", icon: <Gamepad2 size={18} /> },
    { to: "/arm", label: "Arm", icon: <Bot size={18} /> },
    { to: "/laboratory", label: "Laboratory", icon: <FlaskConical size={18} /> },
    { to: "/stratigraphic-profile", label: "Stratigraphic Profile", icon: <Map size={18} /> },
    { to: "/autonomous-navigation", label: "Autonomous Nav", icon: <Navigation2 size={18} /> },
    { to: "/cameras", label: "Cameras", icon: <Gamepad2 size={18} /> },
  ];

  return (
    <aside
      className="
        fixed left-4 top-4 bottom-4
        w-60
        bg-gray-900 text-gray-200
        rounded-2xl border border-gray-800 shadow-xl
        flex flex-col justify-between
      "
    >
      <div>
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 pt-6">
          <img src={logo} alt="Quantum Robotics Logo" className="w-16 h-16 mb-2 select-none" />
          <h1 className="text-lg font-bold text-white tracking-wide">Quantum Robotics</h1>
          <p className="text-sm text-gray-400">Control Interface</p>
        </div>

        <nav className="mt-4 flex flex-col gap-2 px-4">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                  isActive ? "bg-blue-600 text-white" : "hover:bg-gray-800"
                }`
              }
            >
              {link.icon}
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="px-4 py-4 text-xs text-gray-500 border-t border-gray-800">
        © 2026 Quantum Robotics
      </div>
    </aside>
  );
};

export default Sidebar;
