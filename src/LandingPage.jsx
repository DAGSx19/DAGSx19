import React from "react";
import {
  UserPlus,
  LogIn,
  MessageSquare,
  Users,
  Server,
  Shield,
  ArrowRight,
} from "lucide-react";

const DagsLogo = ({ className = "w-8 h-8" }) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M20 20H55C71.5685 20 85 33.4315 85 50C85 66.5685 71.5685 80 55 80H20V20Z"
      stroke="#39FF88"
      strokeWidth="15"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M20 50H50L35 35"
      stroke="#39FF88"
      strokeWidth="12"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function LandingPage({ onNavigate }) {
  return (
    <div className="relative w-full min-h-screen bg-[#07090E] text-white font-sans overflow-hidden flex flex-col justify-between">
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=2000&auto=format&fit=crop"
          alt="Night Cityscape Background"
          className="w-full h-full object-cover object-left opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#07090E]/80 to-[#07090E]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07090E] via-transparent to-[#07090E]/60" />
      </div>

      <header className="relative z-10 w-full px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DagsLogo className="w-8 h-8" />
          <span className="text-2xl font-black tracking-wider text-white">
            DAGS<span className="text-emerald-400">x19</span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400 bg-white/5 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
          <span>Daha iyi bir topluluk için...</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
      </header>

      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-end">
        <div className="w-full md:w-[480px] flex flex-col gap-6 bg-[#0B0F17]/40 backdrop-blur-sm p-4 rounded-3xl">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <DagsLogo className="w-14 h-14" />
              <h1 className="text-4xl font-black tracking-tight text-white">
                DAGS<span className="text-emerald-400">x19</span>
              </h1>
            </div>

            <h2 className="text-3xl font-extrabold leading-snug text-white">
              Arkadaşlarınla konuş.
              <br />
              Topluluğunu keşfet.
              <br />
              <span className="text-emerald-400">
                DAGSx19’a hoş geldin.
              </span>
            </h2>

            <p className="text-gray-400 text-sm mt-3 leading-relaxed">
              Sohbet et, yeni insanlarla tanış, ilgi alanlarını paylaş ve
              kendi topluluğunu oluştur.
            </p>
          </div>

          <div className="flex flex-col gap-3 mt-2">
            <button
              onClick={() => onNavigate && onNavigate("register")}
              className="w-full py-4 px-6 bg-[#39FF88] hover:bg-[#30e57a] text-black font-bold rounded-2xl flex items-center justify-between transition-all duration-200 shadow-lg shadow-emerald-500/20 group"
            >
              <div className="flex items-center gap-3">
                <UserPlus size={20} />
                <span>Hesap Oluştur</span>
              </div>
              <ArrowRight
                size={20}
                className="group-hover:translate-x-1 transition-transform"
              />
            </button>

            <button
              onClick={() => onNavigate && onNavigate("login")}
              className="w-full py-4 px-6 bg-[#161B26]/80 hover:bg-[#1E2535] text-white font-semibold rounded-2xl flex items-center justify-between border border-white/5 transition-all duration-200 group"
            >
              <div className="flex items-center gap-3">
                <LogIn size={20} className="text-gray-400" />
                <span>Giriş Yap</span>
              </div>
              <ArrowRight
                size={20}
                className="text-gray-400 group-hover:translate-x-1 transition-transform"
              />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-4">
            <div className="flex flex-col items-center justify-center gap-2 p-2 rounded-xl hover:bg-white/5 transition cursor-pointer">
              <MessageSquare size={20} className="text-gray-400" />
              <span className="text-xs text-gray-400 font-medium">Sohbet</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-2 p-2 rounded-xl hover:bg-white/5 transition cursor-pointer">
              <Users size={20} className="text-gray-400" />
              <span className="text-xs text-gray-400 font-medium">
                Arkadaşlar
              </span>
            </div>
            <div className="flex flex-col items-center justify-center gap-2 p-2 rounded-xl hover:bg-white/5 transition cursor-pointer">
              <Server size={20} className="text-gray-400" />
              <span className="text-xs text-gray-400 font-medium">
                Sunucular
              </span>
            </div>
            <div className="flex flex-col items-center justify-center gap-2 p-2 rounded-xl hover:bg-white/5 transition cursor-pointer">
              <Shield size={20} className="text-gray-400" />
              <span className="text-xs text-gray-400 font-medium">Güvenli</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 w-full px-8 py-6 flex items-end justify-between">
        <div className="flex items-center gap-3 bg-[#0B0F17]/80 backdrop-blur-md px-4 py-2.5 rounded-full border border-white/10">
          <div className="flex -space-x-2">
            <img
              src="https://i.pravatar.cc/100?img=12"
              className="w-7 h-7 rounded-full border-2 border-[#07090E]"
              alt=""
            />
            <img
              src="https://i.pravatar.cc/100?img=33"
              className="w-7 h-7 rounded-full border-2 border-[#07090E]"
              alt=""
            />
            <img
              src="https://i.pravatar.cc/100?img=60"
              className="w-7 h-7 rounded-full border-2 border-[#07090E]"
              alt=""
            />
            <img
              src="https://i.pravatar.cc/100?img=47"
              className="w-7 h-7 rounded-full border-2 border-[#07090E]"
              alt=""
            />
          </div>
          <span className="text-xs font-medium text-gray-300">
            Binlerce kişi zaten burada!
          </span>
        </div>

        <div className="hidden md:flex flex-col items-end">
          <span className="text-emerald-400 font-serif italic text-lg tracking-wide transform -rotate-3">
            Birlikte daha güçlüyüz 👑
          </span>
        </div>
      </footer>
    </div>
  );
      }
