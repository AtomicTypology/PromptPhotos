import React from 'react';
import { LogIn, Sparkles, Zap, Globe, Layout, Palette, FolderHeart, Shield } from 'lucide-react';

interface LandingPageProps {
  onLogin: () => void;
  isLoggingIn: boolean;
  onContinueAsGuest: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, isLoggingIn, onContinueAsGuest }) => {
  return (
    <div className="min-h-screen bg-studio-bg text-studio-text flex flex-col">
      <nav className="px-6 py-4 flex items-center justify-between border-b border-studio-border/30 bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-studio-accent rounded-lg flex items-center justify-center text-white shadow-lg">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight">PromptStudio</span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={onContinueAsGuest}
            className="text-studio-secondary hover:text-studio-accent text-sm font-medium transition-colors"
          >
            Continue as Guest
          </button>
          <button 
            onClick={onLogin}
            disabled={isLoggingIn}
            className="studio-btn-primary flex items-center gap-2 text-sm"
          >
            <LogIn className="w-4 h-4" />
            {isLoggingIn ? 'Connecting...' : 'Sign In with Replit'}
          </button>
        </div>
      </nav>

      <main className="flex-1">
        <section className="px-6 py-12 md:py-24 max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-studio-accent/10 text-studio-accent rounded-full text-xs font-bold uppercase tracking-widest mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Zap className="w-3 h-3" />
            The Future of Creative Prompting
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 animate-in fade-in slide-in-from-bottom-6 duration-1000">
            Design. Refine. <span className="text-studio-accent">Generate.</span>
          </h1>
          <p className="text-xl text-studio-secondary max-w-2xl mx-auto mb-10 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
            A professional workspace for AI-assisted design. Build mood boards, manage prompt libraries, and iterate on generations with precision.
          </p>
          <div className="flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
            <button 
              onClick={onLogin}
              disabled={isLoggingIn}
              className="w-full sm:w-auto px-8 py-4 bg-studio-accent text-white rounded-2xl font-bold text-lg shadow-xl shadow-studio-accent/20 hover:scale-105 transition-all flex items-center justify-center gap-3"
            >
              <LogIn className="w-5 h-5" />
              {isLoggingIn ? 'Signing in...' : 'Sign In with Replit'}
            </button>
            
            <button 
              onClick={onContinueAsGuest}
              className="py-2 px-6 bg-white border border-studio-border/50 text-studio-secondary rounded-xl text-sm font-bold hover:bg-studio-bg transition-colors"
            >
              Continue as Guest
            </button>
          </div>
        </section>

        <section className="px-6 py-20 bg-studio-card border-y border-studio-border/30">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">Everything you need to master AI Art</h2>
              <p className="text-studio-secondary">A complete toolset for creative directors and digital artists.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: Palette,
                  title: "Mood Boarding",
                  desc: "Upload reference images and extract color palettes to guide your generations."
                },
                {
                  icon: Layout,
                  title: "Prompt Library",
                  desc: "Save your best prompts, categorize them, and reuse them across projects."
                },
                {
                  icon: FolderHeart,
                  title: "Project Management",
                  desc: "Organize your work into projects with specific briefs and global styles."
                },
                {
                  icon: Globe,
                  title: "Cloud Sync",
                  desc: "Access your workspace from anywhere. Your data is securely synced to the cloud."
                },
                {
                  icon: Shield,
                  title: "Privacy First",
                  desc: "You own your data. Export your workspace anytime or purge it from our servers."
                },
                {
                  icon: Zap,
                  title: "Real-time Iteration",
                  desc: "Refine previous generations with feedback to get the perfect result."
                }
              ].map((f, i) => (
                <div key={i} className="bg-white p-8 rounded-3xl border border-studio-border/30 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 bg-studio-accent/10 rounded-2xl flex items-center justify-center text-studio-accent mb-6">
                    <f.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-xl mb-3">{f.title}</h3>
                  <p className="text-studio-secondary text-sm leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 py-12 border-t border-studio-border/30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-studio-accent rounded flex items-center justify-center text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="font-bold">PromptStudio</span>
          </div>
          <p className="text-studio-secondary text-sm">&copy; 2026 PromptStudio. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-studio-secondary hover:text-studio-accent text-sm transition-colors">Privacy Policy</a>
            <a href="#" className="text-studio-secondary hover:text-studio-accent text-sm transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
