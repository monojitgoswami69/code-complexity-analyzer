import React from 'react';
import { ArrowRight, Sun, Moon, Github } from 'lucide-react';

import { useTheme } from '../hooks/useTheme';

interface LandingPageProps {
  onGetStarted: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const { isDark, toggleTheme } = useTheme();
  const [isExiting, setIsExiting] = React.useState(false);

  // Transition Handler
  const handleTransition = () => {
    setIsExiting(true);
    // Notify parent after animation completes
    setTimeout(onGetStarted, 700);
  };

  const getTransform = () => {
    if (isExiting) return 'translate-x-full';
    return 'translate-x-0';
  };

  return (
    <div className={`min-h-screen flex flex-col overflow-hidden relative transition-transform duration-700 ease-in-out ${getTransform()} ${isDark ? 'bg-[#0b1120]' : 'bg-[#EEF1F5]'}`}>
      {/* Background Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full blur-[120px] mix-blend-screen animate-blob ${isDark ? 'bg-blue-600/20' : 'bg-blue-200/40'}`} />
        <div className={`absolute top-[20%] -right-[10%] w-[35%] h-[35%] rounded-full blur-[120px] mix-blend-screen animate-blob animation-delay-2000 ${isDark ? 'bg-purple-600/20' : 'bg-purple-200/40'}`} />
        <div className={`absolute -bottom-[10%] left-[20%] w-[30%] h-[30%] rounded-full blur-[120px] mix-blend-screen animate-blob animation-delay-4000 ${isDark ? 'bg-pink-600/20' : 'bg-pink-200/40'}`} />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen bg-mesh">
        {/* Floating Theme Toggle */}
        <div className="absolute top-8 right-8 z-50">
          <button
            onClick={toggleTheme}
            className={`p-3 rounded-full backdrop-blur-md border transition-all duration-300 shadow-xl group ${isDark ? 'border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10' : 'border-slate-200 bg-white/50 text-slate-500 hover:text-slate-900 hover:bg-white'}`}
          >
            {isDark ? <Sun size={20} className="group-hover:rotate-45 transition-transform duration-500" /> : <Moon size={20} className="group-hover:-rotate-12 transition-transform duration-500" />}
          </button>
        </div>

        {/* Hero & Footer Container */}
        <main className="flex-1 container mx-auto px-6 flex flex-col">
          {/* Centered Body */}
          <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
            <div className="max-w-4xl w-full text-center">
              <h1 className={`text-6xl md:text-8xl font-black quantico-font tracking-tighter mb-8 leading-[0.9] ${isDark ? 'text-white' : 'text-slate-900'}`}>
                WELCOME TO <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-500 animate-gradient-x">CODALYZER</span>
              </h1>

              <p className={`text-xl md:text-2xl mb-12 max-w-2xl mx-auto leading-relaxed font-light ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                The standard for high-performance <span className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>complexity detection</span>.
                Understand time, space, and efficiency in one click.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={handleTransition}
                  className="group relative inline-flex items-center gap-3 px-10 py-5 bg-blue-600 text-white rounded-full text-lg font-bold nova-font transition-all duration-300 hover:bg-blue-500 hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(37,99,235,0.3)] hover:shadow-[0_0_50px_rgba(37,99,235,0.5)]"
                >
                  ACCESS ENGINE
                  <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </div>

          {/* Bottom-Aligned Footer */}
          <footer className="w-full pb-12 text-center animate-fade-in">
            <div className={`h-[1px] w-full max-w-6xl mx-auto mb-8 ${isDark ? 'bg-gradient-to-r from-transparent via-white/10 to-transparent' : 'bg-gradient-to-r from-transparent via-slate-200 to-transparent'}`} />
            <div className={`flex items-center justify-center gap-3 kode-font text-[12px] font-black uppercase tracking-[0.3em] ${isDark ? 'text-white/60' : 'text-slate-800'}`}>
              <span>© 2026 MONOJIT GOSWAMI</span>
              <span className="opacity-40">•</span>
              <a
                href="https://github.com/monojitgoswami69/code-complexity-analyzer"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-blue-500 transition-colors"
              >
                <Github size={14} />
                <span>CODALYZER</span>
              </a>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
};
