import React from 'react';
import { LogIn, Sparkles, Shield, Zap, Globe, Layout, Palette, FolderHeart, X } from 'lucide-react';

interface LandingPageProps {
  onLogin: () => void;
  isLoggingIn: boolean;
  onContinueAsGuest: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, isLoggingIn, onContinueAsGuest }) => {
  const [debugInfo, setDebugInfo] = React.useState<any>(null);
  const [showDebug, setShowDebug] = React.useState(false);
  const [isLoadingDebug, setIsLoadingDebug] = React.useState(false);

  const handleFetchDebug = async () => {
    setIsLoadingDebug(true);
    try {
      const res = await fetch('/api/auth/debug');
      const data = await res.json();
      setDebugInfo(data);
      setShowDebug(true);
    } catch (err) {
      alert('Failed to fetch debug info');
    } finally {
      setIsLoadingDebug(false);
    }
  };

  return (
    <div className="min-h-screen bg-studio-bg text-studio-text flex flex-col">
      {/* Navigation */}
      <nav className="px-6 py-4 flex items-center justify-between border-b border-studio-border/30 bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-studio-accent rounded-lg flex items-center justify-center text-white shadow-lg">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight">PromptStudio</span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleFetchDebug}
            disabled={isLoadingDebug}
            className="text-[10px] font-bold uppercase tracking-widest text-studio-secondary hover:text-studio-accent transition-colors"
          >
            {isLoadingDebug ? 'Checking...' : 'Debug Connection'}
          </button>
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-[10px] font-bold text-studio-secondary uppercase tracking-widest">Redirect URI for Google Console</span>
            <code className="text-[10px] bg-studio-bg px-2 py-0.5 rounded border border-studio-border/50">
              {window.location.origin}/auth/callback
            </code>
          </div>
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
            {isLoggingIn ? 'Connecting...' : 'Sign In'}
          </button>
        </div>
      </nav>

      {/* Debug Modal */}
      {showDebug && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-8 shadow-2xl border border-studio-border/30">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold flex items-center gap-2">
                <Shield className="w-6 h-6 text-studio-accent" />
                Auth Debug Diagnostics
              </h3>
              <button onClick={() => setShowDebug(false)} className="p-2 hover:bg-studio-bg rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="p-4 bg-studio-bg rounded-2xl border border-studio-border/30">
                <h4 className="text-xs font-bold uppercase tracking-widest text-studio-secondary mb-3">Server Configuration</h4>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-studio-secondary">APP_URL Env:</span>
                    <span className={`font-mono ${debugInfo?.envAppUrl === 'NOT SET' ? 'text-red-500' : 'text-emerald-600'}`}>{debugInfo?.envAppUrl}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-studio-secondary">Detected Protocol:</span>
                    <span className="font-mono">{debugInfo?.reqProtocol}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-studio-secondary">Detected Host:</span>
                    <span className="font-mono">{debugInfo?.reqHost}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-studio-secondary">X-Forwarded-Proto:</span>
                    <span className="font-mono">{debugInfo?.xForwardedProto || 'NONE'}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-studio-accent/5 rounded-2xl border border-studio-accent/20">
                <h4 className="text-xs font-bold uppercase tracking-widest text-studio-accent mb-3">Calculated Redirect URI</h4>
                <p className="text-xs text-studio-secondary mb-2">This is what the server is sending to Google:</p>
                <code className="block p-3 bg-white rounded-xl border border-studio-accent/20 text-xs font-mono break-all text-studio-accent font-bold">
                  {debugInfo?.redirectUri}
                </code>
                <p className="text-[10px] text-studio-secondary mt-3 italic">
                  * This MUST exactly match what you have in the Google Cloud Console.
                </p>
              </div>

              <div className="p-4 bg-studio-bg rounded-2xl border border-studio-border/30">
                <h4 className="text-xs font-bold uppercase tracking-widest text-studio-secondary mb-3">Google Credentials</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-white rounded-xl border border-studio-border/30">
                    <p className="text-[10px] uppercase font-bold text-studio-secondary mb-1">Client ID</p>
                    <p className={`text-sm font-mono break-all ${debugInfo?.googleClientId === 'MISSING' ? 'text-red-500' : 'text-emerald-600'}`}>{debugInfo?.googleClientId}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-studio-border/30">
                    <p className="text-[10px] uppercase font-bold text-studio-secondary mb-1">Client Secret</p>
                    <p className={`text-sm font-bold ${debugInfo?.googleClientSecret === 'SET' ? 'text-emerald-600' : 'text-red-500'}`}>{debugInfo?.googleClientSecret}</p>
                  </div>
                </div>
                {(debugInfo?.googleClientId === 'MISSING' || debugInfo?.googleClientSecret === 'MISSING') && (
                  <p className="text-xs text-red-500 mt-3 font-medium">
                    Critical: You must set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in AI Studio Settings.
                  </p>
                )}
              </div>
            </div>

            <button 
              onClick={() => setShowDebug(false)}
              className="w-full mt-8 py-4 bg-studio-accent text-white rounded-2xl font-bold hover:opacity-90 transition-opacity"
            >
              Close Diagnostics
            </button>
          </div>
        </div>
      )}

      {/* Hero Section */}
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
              {isLoggingIn ? 'Signing in...' : 'Sign In with Google'}
            </button>
            
            <div className="max-w-md w-full p-6 bg-amber-50 border border-amber-200 rounded-3xl text-left">
              <h4 className="font-bold text-amber-900 flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4" />
                Trouble Signing In?
              </h4>
              <p className="text-xs text-amber-800 mb-4">
                If you see a "redirect_uri_mismatch" error, ensure your Google Cloud Console is configured with this exact URI:
              </p>
              <div className="flex items-center gap-2 mb-4">
                <code className="flex-1 bg-white p-2 rounded-lg border border-amber-200 text-[10px] font-mono break-all">
                  {window.location.origin}/auth/callback
                </code>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/auth/callback`);
                    alert('Copied to clipboard!');
                  }}
                  className="p-2 bg-amber-200 text-amber-900 rounded-lg hover:bg-amber-300 transition-colors"
                  title="Copy to clipboard"
                >
                  <Shield className="w-4 h-4" />
                </button>
              </div>
              <button 
                onClick={onContinueAsGuest}
                className="w-full py-2 bg-white border border-amber-200 text-amber-900 rounded-xl text-xs font-bold hover:bg-amber-100 transition-colors"
              >
                Skip for now (Continue as Guest)
              </button>
            </div>
          </div>
        </section>

        {/* Features Grid */}
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

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-studio-border/30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-studio-accent rounded flex items-center justify-center text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="font-bold">PromptStudio</span>
          </div>
          <p className="text-studio-secondary text-sm">© 2026 PromptStudio. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-studio-secondary hover:text-studio-accent text-sm transition-colors">Privacy Policy</a>
            <a href="#" className="text-studio-secondary hover:text-studio-accent text-sm transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
