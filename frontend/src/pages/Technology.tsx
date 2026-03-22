import { useEffect, useState } from 'react';

const Technology = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="flex-grow flex flex-col items-center px-6 pt-10 pb-20 w-full max-w-5xl mx-auto">
        <h1 className="text-5xl md:text-6xl font-light tracking-wide animate-spring-up mb-16 text-center">Technology <span className="text-black/30">&amp;</span> Progress</h1>
        
        <div className="w-full flex flex-col gap-8">
            {/* Project Overview */}
            <div className="glass-panel p-8 md:p-12 rounded-[2rem] animate-spring-up delay-100 group hover:bg-white/50 transition-colors duration-700">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center text-black/40 group-hover:bg-black/10 group-hover:scale-105 transition-all duration-500">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight font-['Inter'] text-black/90">Project Overview</h2>
                </div>
                <p className="text-lg leading-relaxed text-black/70 mb-8 font-light max-w-3xl">
                    Right now, there is a massive communication gap between the Deaf community and those who don't know American Sign Language (ASL). <strong className="font-medium text-black/90">Project Signbridge</strong> solves this by using AI to translate ASL into English text in real-time. Because it runs through a standard web browser and webcam, it instantly bridges the gap anywhere, anytime.
                </p>
                <div className="inline-block border border-black/5 rounded-full px-4 py-1.5 bg-white/20">
                    <p className="text-[0.65rem] uppercase tracking-widest text-black/50 font-semibold">* Note: No generative AI was used to produce meaning</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                {/* Milestones Column */}
                <div className="flex flex-col gap-5">
                    <div className="flex items-center gap-3 mb-2 animate-spring-up delay-150 pl-2">
                        <div className="w-8 h-[1px] bg-black/10"></div>
                        <h3 className="text-xs uppercase tracking-[0.2em] text-black/40 font-semibold">Key Milestones</h3>
                    </div>
                    
                    <div className="glass-panel p-6 rounded-3xl animate-spring-up delay-200 hover:-translate-y-1 hover:shadow-xl transition-all duration-500 cursor-default">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-bold tracking-[0.1em] text-black/40 uppercase font-['Inter']">Phase 1</span>
                            <div className="flex items-center gap-2">
                                <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                <span className="text-xs font-semibold tracking-wide font-['Inter'] text-emerald-600">March 18, 2026</span>
                            </div>
                        </div>
                        <h4 className="text-xl font-medium mb-3 text-black/90 font-['Inter'] tracking-tight">Webcam on Browser</h4>
                        <p className="text-sm text-black/60 font-light leading-relaxed">Successfully accessed the webcam natively via the browser and layered Google MediaPipe to annotate 21 micro-points mapping each finger.</p>
                    </div>

                    <div className="glass-panel p-6 rounded-3xl animate-spring-up delay-300 hover:-translate-y-1 hover:shadow-xl transition-all duration-500 cursor-default">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-bold tracking-[0.1em] text-black/40 uppercase font-['Inter'] border border-black/5 px-2 py-0.5 rounded flex items-center">Phase 2</span>
                            <div className="flex items-center gap-2">
                                <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                <span className="text-xs font-semibold tracking-wide font-['Inter'] text-emerald-600">March 19, 2026</span>
                            </div>
                        </div>
                        <h4 className="text-xl font-medium mb-3 text-black/90 font-['Inter'] tracking-tight">Train Neural Network</h4>
                        <p className="text-sm text-black/60 font-light leading-relaxed">Trained a localized Neural Network using an exhaustive ASL fingerspelling dataset strictly engineered to predict alphabetical syntax.</p>
                    </div>
                </div>

                {/* Task Progress Column */}
                <div className="flex flex-col gap-5">
                    <div className="flex items-center gap-3 mb-2 animate-spring-up delay-300 pl-2">
                        <div className="w-8 h-[1px] bg-black/10"></div>
                        <h3 className="text-xs uppercase tracking-[0.2em] text-black/40 font-semibold">Live Task Progress</h3>
                    </div>
                    
                    <div className="glass-panel p-6 rounded-3xl flex flex-col gap-6 animate-spring-up delay-500">
                        
                        {/* Progress Item 1 */}
                        <div className="group cursor-default relative">
                            <div className="flex justify-between items-end mb-2">
                                <div>
                                    <h4 className="text-sm font-semibold font-['Inter'] text-black/80 transition-colors group-hover:text-black">MediaPipe Environment</h4>
                                    <p className="text-[0.65rem] text-black/40 uppercase tracking-wider mt-0.5">Native WebRTC API feed</p>
                                </div>
                                <span className="font-mono text-xs font-medium text-emerald-600">100%</span>
                            </div>
                            <div className="w-full bg-black/5 rounded-full h-1 overflow-hidden">
                                <div className="bg-gradient-to-r from-emerald-400 to-emerald-500 h-1 rounded-full transition-all duration-[1500ms] ease-out delay-0" style={{ width: mounted ? '100%' : '0' }}></div>
                            </div>
                        </div>

                        {/* Progress Item 2 */}
                        <div className="group cursor-default relative">
                            <div className="flex justify-between items-end mb-2">
                                <div>
                                    <h4 className="text-sm font-semibold font-['Inter'] text-black/80 transition-colors group-hover:text-black">Neural Network Architecture I</h4>
                                    <p className="text-[0.65rem] text-black/40 uppercase tracking-wider mt-0.5">Gather Data & Assemble Pipeline</p>
                                </div>
                                <span className="font-mono text-xs font-medium text-emerald-600">100%</span>
                            </div>
                            <div className="w-full bg-black/5 rounded-full h-1 overflow-hidden">
                                <div className="bg-gradient-to-r from-emerald-400 to-emerald-500 h-1 rounded-full transition-all duration-[1500ms] ease-out delay-150" style={{ width: mounted ? '100%' : '0' }}></div>
                            </div>
                        </div>

                        {/* Progress Item 3 */}
                        <div className="group cursor-default relative">
                            <div className="flex justify-between items-end mb-2">
                                <div>
                                    <h4 className="text-sm font-semibold font-['Inter'] text-black/80 transition-colors group-hover:text-black">Neural Network Training II</h4>
                                    <p className="text-[0.65rem] text-black/40 uppercase tracking-wider mt-0.5">WLASL Dataset Epochs</p>
                                </div>
                                <span className="font-mono text-xs font-medium text-amber-500">75%</span>
                            </div>
                            <div className="w-full bg-black/5 rounded-full h-1 overflow-hidden shadow-inner">
                                <div className="relative bg-gradient-to-r from-amber-400 to-amber-500 h-1 rounded-full transition-all duration-[1500ms] ease-out delay-300" style={{ width: mounted ? '75%' : '0' }}>
                                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                                </div>
                            </div>
                        </div>

                        {/* Progress Item 4 */}
                        <div className="group cursor-default relative">
                            <div className="flex justify-between items-end mb-2">
                                <div>
                                    <h4 className="text-sm font-semibold font-['Inter'] text-black/80 transition-colors group-hover:text-black">Interface Refinement</h4>
                                    <p className="text-[0.65rem] text-black/40 uppercase tracking-wider mt-0.5">Redesign Aesthetics & Flow</p>
                                </div>
                                <span className="font-mono text-xs font-medium text-blue-500">100%</span>
                            </div>
                            <div className="w-full bg-black/5 rounded-full h-1 overflow-hidden">
                                <div className="bg-gradient-to-r from-blue-400 to-blue-500 h-1 rounded-full transition-all duration-[1500ms] ease-out delay-500" style={{ width: mounted ? '100%' : '0' }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </main>
  );
};

export default Technology;
