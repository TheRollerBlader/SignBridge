import { Link, useLocation } from 'react-router-dom';

const Navbar = () => {
  const location = useLocation();
  const path = location.pathname;

  return (
    <nav className="flex items-center justify-between px-8 md:px-16 py-8 animate-spring-up w-full z-20">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src="/logo.svg" alt="Signbridge Logo"
                className="h-24 md:h-[7.5rem] w-auto object-contain hover:scale-[1.03] transition-transform duration-500 origin-left"
                style={path === '/team' ? { filter: 'brightness(0) invert(1) opacity(0.9)' } : {}} />
        </Link>

        <div className="hidden md:flex items-center gap-10 glass-nav px-8 py-3 rounded-full">
            <Link to="/technology" className={`nav-link ${path === '/technology' ? 'active' : ''}`}>TECHNOLOGY</Link>
            <Link to="/methodology" className={`nav-link ${path === '/methodology' ? 'active' : ''}`}>METHODOLOGY</Link>
            <Link to="/demo" className={`nav-link ${path === '/demo' ? 'active' : ''}`}>DEMO</Link>
            <Link to="/team" className={`nav-link ${path === '/team' ? 'active' : ''}`}>TEAM</Link>
        </div>

        <div className="flex items-center gap-4">
            <a href="https://github.com/TheRollerBlader/SignBridge.git" target="_blank" rel="noopener noreferrer"
                className="btn-repo glass-btn px-8 py-3 rounded-full flex items-center justify-center leading-none">
                VIEW REPO
            </a>
        </div>
    </nav>
  );
};

export default Navbar;
