const Team = () => {
  return (
    <main className="flex-grow flex flex-col items-center px-6 pt-6 pb-20 w-full max-w-5xl mx-auto animate-spring-up" style={{ animationDelay: '0.1s' }}>
        
        {/* Massive Heading */}
        <div className="w-full text-center md:text-left mb-10">
            <h1 className="title-huge text-[#e0e0db]">ABOUT <span className="text-[#b1b1ae]">US</span></h1>
        </div>

        {/* Team Section */}
        <div className="w-full">
            <h2 className="section-arrow">
                <span>&#10132;</span> TEAM
            </h2>
            
            <div className="grid md:grid-cols-2 gap-12 lg:gap-20">
                {/* Krish Profile */}
                <div className="flex flex-col text-left group">
                    <div className="w-full aspect-square bg-[#161618] rounded-xl mb-6 overflow-hidden border border-white/10 flex items-center justify-center relative shadow-lg group-hover:border-white/20 transition-colors duration-500">
                        <img src="/images/headshot-krish.png" alt="Krish Bharadiya" className="w-full h-full object-cover" />
                    </div>
                    <div className="px-2">
                        <h3 className="font-['Inter'] font-bold text-[1.4rem] mb-3 tracking-tight text-white/95">Krish Bharadiya</h3>
                        <p className="font-['Outfit'] font-light text-[0.95rem] leading-[1.7] text-white/70">
                            Served as the AI Team Lead for the Prosper Engineering robotics team, demonstrating strong technical proficiency in Python, Java, Frontend and Backend development, Machine Learning, and AI API integration. Currently developing an agentic video editing program. Previously developed an award-winning (DRSEF) AI software capable of asteroid detection.
                        </p>
                    </div>
                </div>

                {/* Kush Profile */}
                <div className="flex flex-col text-left group">
                    <div className="w-full aspect-square bg-[#161618] rounded-xl mb-6 overflow-hidden border border-white/10 flex items-center justify-center relative shadow-lg group-hover:border-white/20 transition-colors duration-500">
                        <img src="/images/Kush.jpeg" alt="Kush Bharadiya" className="w-full h-full object-cover" />
                    </div>
                    <div className="px-2">
                        <h3 className="font-['Inter'] font-bold text-[1.4rem] mb-3 tracking-tight text-white/95">Kush Bharadiya</h3>
                        <p className="font-['Outfit'] font-light text-[0.95rem] leading-[1.7] text-white/70">
                            I possess a keen interest in Python and Machine Learning, and I am currently engaged in several projects. These include the development of an application with the potential to yield significant cost savings and foster community enhancement, as well as a science fair initiative utilizing AI for the detection of diseases through the analysis of environmental factors. My technical expertise spans both Python and JavaScript.
                        </p>
                    </div>
                </div>
            </div>
        </div>

        {/* Guiding Principles Section */}
        <div className="w-full mt-14">
            <h2 className="section-arrow">
                <span>&#10132;</span> GUIDING PRINCIPLES
            </h2>

            <div className="flex flex-col gap-6">
                <div className="glass-panel-dark flex flex-col md:flex-row items-baseline md:items-center gap-4 group">
                    <div>
                        <h4 className="font-['Inter'] font-extrabold text-white/95 text-lg md:text-xl tracking-tight uppercase mb-1">Zero-Friction Accessibility</h4>
                        <p className="font-['Outfit'] font-light text-[0.95rem] leading-relaxed text-white/60">The application must work instantly on standard devices without requiring users to buy special hardware, download apps, or create accounts.</p>
                    </div>
                </div>
                
                <div className="glass-panel-dark flex flex-col md:flex-row items-baseline md:items-center gap-4 group">
                    <div>
                        <h4 className="font-['Inter'] font-extrabold text-white/95 text-lg md:text-xl tracking-tight uppercase mb-1">Speed Over Complexity</h4>
                        <p className="font-['Outfit'] font-light text-[0.95rem] leading-relaxed text-white/60">We dedicate time to collaborating to generate creative solutions where every team member has a voice.</p>
                    </div>
                </div>

                <div className="glass-panel-dark flex flex-col md:flex-row items-baseline md:items-center gap-4 group">
                    <div>
                        <h4 className="font-['Inter'] font-extrabold text-white/95 text-lg md:text-xl tracking-tight uppercase mb-1">Privacy by Design</h4>
                        <p className="font-['Outfit'] font-light text-[0.95rem] leading-relaxed text-white/60">Since you are handling live webcams, ensure no actual video frames are ever saved or sent to the server—only transmit the mathematical hand coordinates.</p>
                    </div>
                </div>

                <div className="glass-panel-dark flex flex-col md:flex-row items-baseline md:items-center gap-4 group">
                    <div>
                        <h4 className="font-['Inter'] font-extrabold text-white/95 text-lg md:text-xl tracking-tight uppercase mb-1">Accuracy Over Scale</h4>
                        <p className="font-['Outfit'] font-light text-[0.95rem] leading-relaxed text-white/60">It is better to have a model that translates the 26 static letters of the alphabet with 99% accuracy than one that attempts 100 dynamic words with 50% accuracy.</p>
                    </div>
                </div>
            </div>
        </div>
    </main>
  );
};

export default Team;
