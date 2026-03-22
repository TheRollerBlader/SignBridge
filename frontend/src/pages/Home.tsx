import { Link } from 'react-router-dom';

const Home = () => {
  return (
    <main className="flex-grow flex flex-col items-center justify-center px-6 text-center z-10 relative">
        <div className="flex flex-col items-center justify-center liquid-drift">

            {/* Row 1: Vision + Video */}
            <div className="hero-title animate-fly-in delay-100">
                <span>Vision</span>
                <div className="oval-video-container animate-spring-expand delay-200 mx-3">
                    <div className="ai-node-soft" style={{ top: '35%', left: '45%' }}></div>
                    <div className="ai-node-soft" style={{ top: '50%', left: '65%', animationDelay: '1s' }}></div>
                    <div className="ai-node-soft" style={{ top: '65%', left: '40%', animationDelay: '2s' }}></div>
                    <img src="/images/hero_image.png" alt="Vision"
                        className="w-full h-full object-cover opacity-90 transition-opacity duration-1000 hover:opacity-100 pointer-events-none" />
                </div>
            </div>

            {/* Row 2: is Our */}
            <div className="is-text animate-fly-in delay-300">
                is our
            </div>

            {/* Row 3: Bridge */}
            <div className="hero-title animate-fly-in delay-400">
                <span className="hero-title-bold">Bridge</span>
            </div>
        </div>

        {/* Call to Actions */}
        <div className="mt-20 flex flex-col md:flex-row items-center gap-10 animate-spring-up delay-500">
            <Link to="/demo" className="btn-primary-liquid" style={{ textDecoration: 'none' }}>
                Experience Demo
            </Link>
            <Link to="/methodology"
                className="group flex items-center gap-3 text-[0.8rem] font-medium tracking-[0.05em] text-black/60 hover:text-black/100 transition-colors duration-500">
                Discover Methodology
                <div
                    className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center group-hover:bg-white group-hover:border-white/50 group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all duration-500">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round"
                        className="transform group-hover:translate-x-0.5 transition-transform duration-500">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </div>
            </Link>
        </div>
    </main>
  );
};

export default Home;
