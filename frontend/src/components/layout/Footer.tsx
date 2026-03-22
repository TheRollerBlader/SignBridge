import { useLocation } from 'react-router-dom';

const Footer = () => {
  const location = useLocation();
  const isDark = location.pathname === '/team';

  return (
    <footer className={`px-8 md:px-16 py-10 z-10 w-full relative ${isDark ? 'border-t border-white/5 mt-10' : 'animate-spring-up delay-500'}`}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-10">
            <div className={`flex items-center gap-3 font-medium text-[0.7rem] tracking-[0.1em] ${isDark ? "font-['Inter'] text-white/40" : 'footer-text'}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
                <span className="uppercase">Private by Design</span>
            </div>

            <div className={`flex flex-wrap justify-center items-center gap-10 opacity-30 text-xs tracking-wider ${isDark ? 'text-white' : 'grayscale'}`}>
                <span className="font-light">Hackathon '26</span>
                <span className="font-serif italic text-sm">Gemini</span>
                <span className="font-medium">MediaPipe</span>
                <span className="font-mono">TensorFlow</span>
            </div>

            {!isDark && (
              <div className="flex items-center gap-4 footer-text font-medium text-[0.65rem] tracking-[0.15em] uppercase">
                  <span>Explore</span>
                  <div
                      className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center group hover:bg-white/50 transition-colors duration-500 cursor-pointer">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round"
                          className="transform group-hover:translate-y-0.5 transition-transform duration-500">
                          <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
                      </svg>
                  </div>
              </div>
            )}
        </div>
    </footer>
  );
};

export default Footer;
