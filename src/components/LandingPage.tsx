import React from 'react';
import { LogIn, Sparkles, Shield, Zap, Globe, Layout, Palette, FolderHeart, UserPlus } from 'lucide-react';

interface LandingPageProps {
  onLogin: (data: { email: string; password: string }) => Promise<void>;
  onSignup: (data: { name: string; email: string; password: string }) => Promise<void>;
  isAuthenticating: boolean;
  authError: string | null;
  onContinueAsGuest: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onSignup, isAuthenticating, authError, onContinueAsGuest }) => {
  const [mode, setMode] = React.useState<'login' | 'signup'>('login');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [localError, setLocalError] = React.useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    if (mode === 'signup') {
      if (!name.trim()) {
        setLocalError('Please enter your name.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match.');
        return;
      }
      await onSignup({ name: name.trim(), email, password });
      return;
    }

    await onLogin({ email, password });
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setMode('login');
              setLocalError(null);
            }}
            className={`text-sm font-medium transition-colors ${mode === 'login' ? 'text-studio-accent' : 'text-studio-secondary hover:text-studio-accent'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setMode('signup');
              setLocalError(null);
            }}
            className={`text-sm font-medium transition-colors ${mode === 'signup' ? 'text-studio-accent' : 'text-studio-secondary hover:text-studio-accent'}`}
          >
            Create Account
          </button>
          <button 
            onClick={onContinueAsGuest}
            className="text-studio-secondary hover:text-studio-accent text-sm font-medium transition-colors"
          >
            Continue as Guest
          </button>
        </div>
      </nav>

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
            Sign in with email and password to keep your projects, prompts, and mood boards together in one workspace.
          </p>
          <div className="flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
            <div className="w-full max-w-md text-left bg-white p-8 rounded-3xl border border-studio-border/30 shadow-xl">
              <div className="flex items-center gap-2 p-1 mb-6 bg-studio-bg rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setLocalError(null);
                  }}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${mode === 'login' ? 'bg-white text-studio-accent shadow-sm' : 'text-studio-secondary'}`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setLocalError(null);
                  }}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${mode === 'signup' ? 'bg-white text-studio-accent shadow-sm' : 'text-studio-secondary'}`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full studio-input"
                      placeholder="Creative lead"
                      autoComplete="name"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full studio-input"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full studio-input"
                    placeholder="At least 8 characters"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    minLength={8}
                    required
                  />
                </div>
                {mode === 'signup' && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Confirm Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full studio-input"
                      placeholder="Repeat your password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </div>
                )}

                {(localError || authError) && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {localError || authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isAuthenticating}
                  className="w-full px-8 py-4 bg-studio-accent text-white rounded-2xl font-bold text-lg shadow-xl shadow-studio-accent/20 hover:scale-[1.01] transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:hover:scale-100"
                >
                  {mode === 'login' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                  {isAuthenticating ? 'Working...' : mode === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-studio-border/30 space-y-3">
                <p className="text-xs text-studio-secondary">
                  {mode === 'login' ? "Don't have an account yet?" : 'Already have an account?'}
                  <button
                    type="button"
                    onClick={() => {
                      setMode(mode === 'login' ? 'signup' : 'login');
                      setLocalError(null);
                    }}
                    className="ml-2 font-bold text-studio-accent hover:underline"
                  >
                    {mode === 'login' ? 'Create one' : 'Sign in instead'}
                  </button>
                </p>
                <button 
                  onClick={onContinueAsGuest}
                  className="w-full py-2 bg-studio-bg border border-studio-border/30 text-studio-secondary rounded-xl text-xs font-bold hover:text-studio-accent transition-colors"
                >
                  Continue as Guest
                </button>
              </div>
            </div>

            <div className="max-w-md w-full p-6 bg-emerald-50 border border-emerald-200 rounded-3xl text-left">
              <h4 className="font-bold text-emerald-900 flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4" />
                Simpler sign-in
              </h4>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Google OAuth is no longer required here. Create an account with your email and password, and the app will keep using the same session-based flow after sign-in.
              </p>
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
