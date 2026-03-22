import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';

const Layout = () => {
  const location = useLocation();

  useEffect(() => {
    // Determine if the current page should be dark theme
    const isDark = location.pathname === '/team';
    if (isDark) {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    }
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col">
      {location.pathname !== '/team' && <div className="light-glow"></div>}
      <Navbar />
      <Outlet />
      <Footer />
    </div>
  );
};

export default Layout;
