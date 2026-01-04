import { SplineScene } from './ui/splite';
import { Spotlight } from './ui/spotlight';
import { Brain, ArrowRight, Upload, Search, MessageSquare, BarChart2, Sparkles } from 'lucide-react';
import { ThemeToggle } from './ui';

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/50 to-violet-50/30 dark:from-secondary-900 dark:via-secondary-900 dark:to-secondary-800 relative">
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="rgba(59, 130, 246, 0.15)"
      />

      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-20 w-72 h-72 bg-violet-400/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/3 w-80 h-80 bg-cyan-400/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-20 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-primary-500/20 blur-xl rounded-full" />
              <Brain className="relative h-7 w-7 text-primary-600 dark:text-primary-400" />
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-primary-600 to-accent-600 dark:from-primary-400 dark:to-accent-400 bg-clip-text text-transparent">
              Second Brain
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col lg:flex-row h-[calc(100vh-72px)]">
        {/* Left content - Ultra Glossy 3D Card - In front */}
        <div className="flex-1 flex items-center px-6 lg:px-12 py-4 z-10">
          <div className="max-w-lg">
            {/* Ultra glossy elevated glass card */}
            <div 
              className="relative p-8 rounded-3xl transform hover:-translate-y-1 transition-transform duration-300"
              style={{
                transform: 'perspective(1000px) rotateX(2deg) rotateY(-2deg)',
              }}
            >
              {/* Multiple shadow layers for 3D depth */}
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/90 to-white/70 dark:from-secondary-800/90 dark:to-secondary-900/70" 
                style={{
                  boxShadow: `
                    0 4px 6px -1px rgba(0, 0, 0, 0.05),
                    0 10px 15px -3px rgba(0, 0, 0, 0.08),
                    0 20px 25px -5px rgba(0, 0, 0, 0.08),
                    0 40px 50px -12px rgba(0, 0, 0, 0.15),
                    0 0 0 1px rgba(255, 255, 255, 0.5),
                    inset 0 1px 0 0 rgba(255, 255, 255, 0.9),
                    inset 0 -1px 0 0 rgba(0, 0, 0, 0.05)
                  `
                }}
              />
              
              {/* Glossy shine overlay - top highlight */}
              <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-3xl bg-gradient-to-b from-white/80 via-white/40 to-transparent dark:from-white/20 dark:via-white/5 dark:to-transparent pointer-events-none" />
              
              {/* Edge highlight - left */}
              <div className="absolute inset-y-4 left-0 w-[1px] bg-gradient-to-b from-transparent via-white/80 to-transparent dark:via-white/30 pointer-events-none" />
              
              {/* Edge highlight - top */}
              <div className="absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/40 pointer-events-none" />

              {/* Subtle rainbow reflection */}
              <div className="absolute top-4 right-4 w-32 h-32 bg-gradient-to-br from-blue-400/10 via-purple-400/10 to-pink-400/10 rounded-full blur-2xl pointer-events-none" />

              {/* Glass border */}
              <div className="absolute inset-0 rounded-3xl border border-white/60 dark:border-white/20 pointer-events-none" />

              {/* Content */}
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 bg-gradient-to-r from-primary-100/90 to-primary-50/90 dark:from-primary-900/50 dark:to-primary-800/50 rounded-full border border-primary-200/50 dark:border-primary-700/50 shadow-sm"
                  style={{
                    boxShadow: '0 2px 8px -2px rgba(59, 130, 246, 0.3), inset 0 1px 0 0 rgba(255,255,255,0.5)'
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
                  <span className="text-xs font-medium text-primary-700 dark:text-primary-300">
                    AI-Powered Knowledge Base
                  </span>
                </div>

                <h1 className="text-4xl lg:text-5xl font-bold leading-tight">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-secondary-900 via-secondary-700 to-secondary-900 dark:from-white dark:via-secondary-200 dark:to-white drop-shadow-sm">
                    Your Second
                  </span>
                  <br />
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary-600 via-accent-600 to-primary-600 dark:from-primary-400 dark:via-accent-400 dark:to-primary-400">
                    Brain
                  </span>
                </h1>

                <p className="mt-4 text-base text-secondary-600 dark:text-secondary-300 leading-relaxed">
                  Upload documents, ask questions, and get intelligent answers powered by advanced RAG technology.
                </p>

                <div className="mt-6">
                  <button
                    onClick={onGetStarted}
                    className="group inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold rounded-xl transition-all duration-200 hover:-translate-y-0.5"
                    style={{
                      boxShadow: '0 4px 14px -3px rgba(59, 130, 246, 0.5), 0 8px 20px -6px rgba(59, 130, 246, 0.4), inset 0 1px 0 0 rgba(255,255,255,0.2)'
                    }}
                  >
                    Get Started
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>

                {/* Features Grid - Glossy mini cards */}
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {[
                    { icon: Upload, label: 'Upload Docs', color: 'text-primary-600 dark:text-primary-400', bg: 'from-primary-100 to-primary-50 dark:from-primary-900/50 dark:to-primary-800/30' },
                    { icon: Search, label: 'Vector Search', color: 'text-accent-600 dark:text-accent-400', bg: 'from-accent-100 to-accent-50 dark:from-accent-900/50 dark:to-accent-800/30' },
                    { icon: MessageSquare, label: 'AI Chat', color: 'text-emerald-600 dark:text-emerald-400', bg: 'from-emerald-100 to-emerald-50 dark:from-emerald-900/50 dark:to-emerald-800/30' },
                    { icon: BarChart2, label: 'Analytics', color: 'text-cyan-600 dark:text-cyan-400', bg: 'from-cyan-100 to-cyan-50 dark:from-cyan-900/50 dark:to-cyan-800/30' },
                  ].map((feature, i) => (
                    <div 
                      key={i}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gradient-to-br from-white/80 to-white/60 dark:from-secondary-800/80 dark:to-secondary-800/60 hover:-translate-y-0.5 transition-transform duration-200 cursor-default"
                      style={{
                        boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.08), 0 4px 12px -4px rgba(0, 0, 0, 0.06), inset 0 1px 0 0 rgba(255,255,255,0.7), 0 0 0 1px rgba(255,255,255,0.5)'
                      }}
                    >
                      <div className={`p-2 rounded-lg bg-gradient-to-br ${feature.bg}`}
                        style={{
                          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.5), 0 1px 3px -1px rgba(0,0,0,0.1)'
                        }}
                      >
                        <feature.icon className={`h-4 w-4 ${feature.color}`} />
                      </div>
                      <span className="font-medium text-secondary-900 dark:text-secondary-100 text-sm">{feature.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right content - 3D Scene - Behind the text card */}
        <div className="flex-[1.3] relative -ml-20 z-0">
          <div className="absolute inset-0 scale-125 origin-center">
            <SplineScene
              scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
              className="w-full h-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
