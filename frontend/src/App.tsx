import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Team from './pages/Team';
import Demo from './pages/Demo';
import Technology from './pages/Technology';
import Methodology from './pages/Methodology';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="team" element={<Team />} />
        <Route path="demo" element={<Demo />} />
        <Route path="technology" element={<Technology />} />
        <Route path="methodology" element={<Methodology />} />
      </Route>
    </Routes>
  );
}

export default App;
