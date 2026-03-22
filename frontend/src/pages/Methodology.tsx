const Methodology = () => {
  return (
    <main className="flex-grow flex flex-col items-center px-6 pt-10 pb-20 w-full max-w-5xl mx-auto">
      <div className="text-center animate-spring-up mb-16 w-full max-w-3xl">
          <div className="text-xs uppercase tracking-[0.2em] text-emerald-600 font-semibold mb-4">Project Signbridge — Krish Bharadiya &amp; Kush Bharadiya | Technical Methodology</div>
          <h1 className="text-5xl md:text-6xl font-light tracking-wide mb-6">Real-Time ASL<br />Gesture Recognition</h1>
          <p className="text-xl text-black/60 font-light leading-relaxed mb-8">A complete engineering guide — from raw hand landmark data to live web translation, using MediaPipe, neural networks, and WebSockets.</p>
          <div className="flex flex-wrap justify-center gap-4 text-sm font-medium text-black/50 mb-12">
            <span className="glass-panel px-4 py-2 rounded-full shadow-sm text-black/80">🖐 MediaPipe + Neural Networks</span>
            <span className="glass-panel px-4 py-2 rounded-full shadow-sm text-black/80">🌐 WebSocket Inference Pipeline</span>
            <span className="glass-panel px-4 py-2 rounded-full shadow-sm text-black/80">📐 5 Implementation Steps</span>
          </div>
        </div>

        {/* TOC */}
        <div className="glass-panel p-8 md:p-12 mb-8 animate-spring-up rounded-[2rem] w-full text-left">
          <h3 className="text-2xl font-semibold tracking-tight font-['Inter'] text-black/90 mb-4 border-b border-black/5 pb-4">Contents</h3>
          <ol className="list-decimal list-inside space-y-3 text-lg text-black/70 font-light mt-4">
            <li>Data Engineering — Making Coordinates Translation-Invariant</li>
            <li>Creating the Training Dataset</li>
            <li>Designing the Model Architecture</li>
            <li>Training &amp; Exporting the Model</li>
            <li>The Real-Time Inference Pipeline</li>
          </ol>
        </div>

        {/* STEP 1 */}
        <div className="glass-panel p-8 md:p-12 mb-10 animate-spring-up rounded-[2rem] w-full text-left">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40 font-semibold mb-2 flex items-center gap-3"><div className="w-8 h-[1px] bg-black/10"></div>Step 01</div>
          <h2 className="text-3xl font-semibold tracking-tight font-['Inter'] text-black/90 mb-6">Data Engineering — The Secret to Accuracy</h2>
          <p className="text-lg leading-relaxed text-black/70 mb-6 font-light">The biggest mistake developers make is feeding raw MediaPipe coordinates directly into a neural network. If you train with your hand in the center of the screen, the model fails when your hand moves to the corner — the (x, y) pixel coordinates change. The solution is to make all data <em className="italic text-black/90 font-medium">translation-invariant</em> and <em className="italic text-black/90 font-medium">scale-invariant</em> before any training or inference.</p>

          <div className="border-l-4 border-amber-500 bg-amber-50/50 p-6 rounded-r-2xl my-6 text-black/80 backdrop-blur-sm">
            <strong className="text-xs font-bold uppercase tracking-widest mb-2 block text-amber-700">Common Pitfall</strong>
            Raw pixel coordinates encode the hand's <em className="italic text-black/90 font-medium">position on screen</em>, not its shape. A model trained on centered hands will fail on corner-positioned hands — the numbers look completely different even though the gesture is identical.
          </div>

          <p className="text-lg leading-relaxed text-black/70 mb-6 font-light">MediaPipe gives you 21 3D landmarks (x, y, z) per hand — that's 63 data points per frame. The preprocessing pipeline has three stages:</p>

          <ul className="flex flex-col gap-4 my-8">
            <li>
              <span className="num glass-panel px-4 py-2 font-bold shadow-sm inline-block mr-4">1</span>
              <span className="glass-panel px-4 py-2 rounded-full shadow-sm text-black/80"><strong className="font-medium text-black/90">Extract landmarks.</strong> MediaPipe outputs 21 3D points per frame — Landmark 0 is the wrist, Landmarks 1–20 are fingers and knuckles.</span>
            </li>
            <li>
              <span className="num glass-panel px-4 py-2 font-bold shadow-sm inline-block mr-4">2</span>
              <span className="glass-panel px-4 py-2 rounded-full shadow-sm text-black/80"><strong className="font-medium text-black/90">Calculate relative coordinates.</strong> Subtract the wrist (Landmark 0) from every other point. This anchors all geometry to the hand itself, not the screen.</span>
            </li>
            <li>
              <span className="num glass-panel px-4 py-2 font-bold shadow-sm inline-block mr-4">3</span>
              <span className="glass-panel px-4 py-2 rounded-full shadow-sm text-black/80"><strong className="font-medium text-black/90">Flatten and normalize.</strong> Flatten the 20 × 3 array into 63 numbers, then normalize to [−1, 1]. This makes a close-up hand and a distant hand look identical to the model.</span>
            </li>
          </ul>

          <div className="font-mono bg-white/50 border border-white/80 rounded-[1.5rem] p-6 my-8 text-center text-black/80 shadow-sm text-lg relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-emerald-500/5"></div><span className="relative">
            P<sub>relative</sub> = P<sub>i</sub> − P<sub>wrist</sub> &nbsp; for i = 1 … 20</span>
          </div>

          <div className="bg-white/40 border border-white/60 rounded-[2rem] pt-10 pb-6 px-6 mx-auto my-12 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col items-center max-w-4xl overflow-x-auto w-full svg-container relative"><div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent rounded-[2rem] pointer-events-none"></div>
            <svg width="100%" viewBox="0 0 760 160" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="arr1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
              </defs>
              <rect x="20" y="52" width="160" height="56" rx="8" fill="#dbeafe" stroke="#2563eb" strokeWidth="1"/>
              <text x="100" y="76" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#1e40af">MediaPipe output</text>
              <text x="100" y="94" textAnchor="middle" fontSize="10.5" fill="#3b82f6">21 × 3D landmarks</text>
              <line x1="180" y1="80" x2="218" y2="80" stroke="#1a1a1a" strokeWidth="1.2" markerEnd="url(#arr1)"/>
              <text x="198" y="72" textAnchor="middle" fontSize="9.5" fill="#888">Subtract</text>
              <text x="198" y="91" textAnchor="middle" fontSize="9.5" fill="#888">wrist</text>
              <rect x="220" y="52" width="160" height="56" rx="8" fill="#ccfbf1" stroke="#0f766e" strokeWidth="1"/>
              <text x="300" y="76" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#134e4a">Relative coords</text>
              <text x="300" y="94" textAnchor="middle" fontSize="10.5" fill="#0f766e">20 × 3D offsets</text>
              <line x1="380" y1="80" x2="418" y2="80" stroke="#1a1a1a" strokeWidth="1.2" markerEnd="url(#arr1)"/>
              <text x="398" y="72" textAnchor="middle" fontSize="9.5" fill="#888">Flatten +</text>
              <text x="398" y="91" textAnchor="middle" fontSize="9.5" fill="#888">Normalize</text>
              <rect x="420" y="52" width="160" height="56" rx="8" fill="#fef3c7" stroke="#b45309" strokeWidth="1"/>
              <text x="500" y="76" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#78350f">Normalized vector</text>
              <text x="500" y="94" textAnchor="middle" fontSize="10.5" fill="#b45309">63 floats ∈ [−1, 1]</text>
              <line x1="580" y1="80" x2="618" y2="80" stroke="#1a1a1a" strokeWidth="1.2" markerEnd="url(#arr1)"/>
              <text x="598" y="72" textAnchor="middle" fontSize="9.5" fill="#888">Feed to</text>
              <text x="598" y="91" textAnchor="middle" fontSize="9.5" fill="#888">model</text>
              <rect x="620" y="52" width="120" height="56" rx="8" fill="#ede9fe" stroke="#6d28d9" strokeWidth="1"/>
              <text x="680" y="76" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#4c1d95">Neural</text>
              <text x="680" y="94" textAnchor="middle" fontSize="10.5" fill="#6d28d9">Network</text>
            </svg>
            <div className="text-xs text-black/40 font-medium tracking-wide mt-8 mb-2 italic text-center w-full uppercase">Figure 1 — The preprocessing pipeline that converts raw landmarks into model-ready input</div>
          </div>
        </div>

        {/* STEP 2 */}
        <div className="glass-panel p-8 md:p-12 mb-10 animate-spring-up rounded-[2rem] w-full text-left">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40 font-semibold mb-2 flex items-center gap-3"><div className="w-8 h-[1px] bg-black/10"></div>Step 02</div>
          <h2 className="text-3xl font-semibold tracking-tight font-['Inter'] text-black/90 mb-6">Creating the Training Dataset</h2>
          <p className="text-lg leading-relaxed text-black/70 mb-6 font-light">You cannot use standard image datasets (like Kaggle ASL images) because your model doesn't process pixels — it processes MediaPipe landmarks. You need a custom dataset of landmark vectors, one for each sign you want to recognize.</p>

          <div className="border-l-4 border-blue-500 bg-blue-50/50 p-6 rounded-r-2xl my-6 text-black/80 backdrop-blur-sm">
            <strong className="text-xs font-bold uppercase tracking-widest mb-2 block text-blue-700">Why Not Image Datasets?</strong>
            Image-based CNNs learn pixel patterns — lighting, skin tone, background. Your landmark-based model learns pure hand geometry. These are fundamentally different inputs and require different datasets.
          </div>

          <div className="bg-white/40 border border-white/60 rounded-[2rem] pt-10 pb-6 px-6 mx-auto my-12 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col items-center max-w-4xl overflow-x-auto w-full svg-container relative"><div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent rounded-[2rem] pointer-events-none"></div>
            <svg width="100%" viewBox="0 0 760 220" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="arr2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
              </defs>
              <rect x="20" y="84" width="120" height="48" rx="24" fill="#f1f0ec" stroke="#888" strokeWidth="1"/>
              <text x="80" y="113" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#444">Begin</text>
              <line x1="140" y1="108" x2="178" y2="108" stroke="#1a1a1a" strokeWidth="1.2" markerEnd="url(#arr2)"/>
              <rect x="180" y="72" width="150" height="72" rx="8" fill="#dbeafe" stroke="#2563eb" strokeWidth="1"/>
              <text x="255" y="100" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#1e40af">Record sign</text>
              <text x="255" y="118" textAnchor="middle" fontSize="10.5" fill="#3b82f6">500 frames per</text>
              <text x="255" y="133" textAnchor="middle" fontSize="10.5" fill="#3b82f6">letter, varied angles</text>
              <line x1="330" y1="108" x2="368" y2="108" stroke="#1a1a1a" strokeWidth="1.2" markerEnd="url(#arr2)"/>
              <rect x="370" y="72" width="150" height="72" rx="8" fill="#fef3c7" stroke="#b45309" strokeWidth="1"/>
              <text x="445" y="100" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#78350f">Preprocess</text>
              <text x="445" y="118" textAnchor="middle" fontSize="10.5" fill="#b45309">Apply Step 1</text>
              <text x="445" y="133" textAnchor="middle" fontSize="10.5" fill="#b45309">normalization</text>
              <line x1="520" y1="108" x2="558" y2="108" stroke="#1a1a1a" strokeWidth="1.2" markerEnd="url(#arr2)"/>
              <rect x="560" y="72" width="140" height="72" rx="8" fill="#ccfbf1" stroke="#0f766e" strokeWidth="1"/>
              <text x="630" y="100" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#134e4a">Save to CSV</text>
              <text x="630" y="118" textAnchor="middle" fontSize="10.5" fill="#0f766e">63 floats +</text>
              <text x="630" y="133" textAnchor="middle" fontSize="10.5" fill="#0f766e">label ("A", "B"…)</text>
              <path d="M630 144 L630 190 L255 190 L255 145" fill="none" stroke="#888" strokeWidth="1.2" strokeDasharray="5 3" markerEnd="url(#arr2)"/>
              <text x="440" y="183" textAnchor="middle" fontSize="10.5" fill="#888">Repeat for all 26 letters</text>
            </svg>
            <div className="text-xs text-black/40 font-medium tracking-wide mt-8 mb-2 italic text-center w-full uppercase">Figure 2 — Data collection loop for building a custom landmark dataset</div>
          </div>

          <p className="text-lg leading-relaxed text-black/70 mb-6 font-light">Each row of your final CSV contains 63 normalized floats followed by a single label. A dataset for the full ASL alphabet requires roughly 26 × 500 = 13,000 rows minimum. More angles and distances per sign equals better generalization.</p>

          <div className="font-mono bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 my-8 text-left text-gray-300 shadow-xl overflow-x-auto text-sm leading-relaxed">
            <span className="text-[#6A9955]"># Final dataset format (CSV row)</span><br />
            <span className="text-[#569cd6]">0.12</span>, <span className="text-[#569cd6]">-0.45</span>, <span className="text-[#569cd6]">0.03</span>, ..., <span className="text-[#569cd6]">0.78</span>, <span className="text-[#ce9178]">"B"</span><br />
            <span className="text-[#6A9955]"># 63 normalized floats    ^label</span>
          </div>
        </div>

        {/* STEP 3 */}
        <div className="glass-panel p-8 md:p-12 mb-10 animate-spring-up rounded-[2rem] w-full text-left">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40 font-semibold mb-2 flex items-center gap-3"><div className="w-8 h-[1px] bg-black/10"></div>Step 03</div>
          <h2 className="text-3xl font-semibold tracking-tight font-['Inter'] text-black/90 mb-6">Designing the Model Architecture</h2>
          <p className="text-lg leading-relaxed text-black/70 mb-6 font-light">Because you're analyzing structured numerical data (not raw images), you don't need heavy Convolutional Neural Networks. The right architecture depends on whether you're recognizing static letters or dynamic words requiring motion over time.</p>

          <div className="grid md:grid-cols-2 gap-8 my-10">
            <div className="bg-white/40 border border-white/60 rounded-[2rem] p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-500 relative overflow-hidden group">
              <div className="text-xs font-bold uppercase tracking-widest mb-4 opacity-80" style={{ color: 'var(--accent)' }}>Option A — Static signs</div>
              <h4 className="text-2xl font-bold mb-4 font-['Inter'] text-black/90">Feed-Forward MLP</h4>
              <p className="text-lg leading-relaxed text-black/70 mb-6 font-light">For the ASL alphabet where a single frame tells you the letter. Simple, fast, and highly accurate on static poses.</p>
              <div className="font-mono text-xs bg-black/5 px-4 py-3 rounded-xl mt-6 text-black/70 border border-black/10 group-hover:bg-white/60 transition-colors">Input: 63 → 128 → 64 → 26 (Softmax)</div>
            </div>
            <div className="bg-white/40 border border-white/60 rounded-[2rem] p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-500 relative overflow-hidden group">
              <div className="text-xs font-bold uppercase tracking-widest mb-4 opacity-80" style={{ color: 'var(--teal)' }}>Option B — Dynamic signs</div>
              <h4 className="text-2xl font-bold mb-4 font-['Inter'] text-black/90">LSTM / GRU Network</h4>
              <p className="text-lg leading-relaxed text-black/70 mb-6 font-light">For words like "Hello" or "Thank You" that require movement over time. A window of 30 frames is fed as a sequence.</p>
              <div className="font-mono text-xs bg-black/5 px-4 py-3 rounded-xl mt-6 text-black/70 border border-black/10 group-hover:bg-white/60 transition-colors">Input: 30 × 63 → LSTM → Dense → N</div>
            </div>
          </div>

          {/* MLP Architecture Diagram */}
          <div className="bg-white/40 border border-white/60 rounded-[2rem] pt-10 pb-6 px-6 mx-auto my-12 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col items-center max-w-4xl overflow-x-auto w-full svg-container relative"><div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent rounded-[2rem] pointer-events-none"></div>
            <svg width="100%" viewBox="0 0 780 280" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="arr3" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
              </defs>
              {/* Layer labels */}
              <text x="90" y="24" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#888" letterSpacing="0.08em">INPUT</text>
              <text x="250" y="24" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#888" letterSpacing="0.08em">HIDDEN 1</text>
              <text x="430" y="24" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#888" letterSpacing="0.08em">HIDDEN 2</text>
              <text x="610" y="24" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#888" letterSpacing="0.08em">HIDDEN 3</text>
              <text x="730" y="24" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#888" letterSpacing="0.08em">OUTPUT</text>

              {/* Input nodes */}
              <circle cx="90" cy="60" r="10" fill="#dbeafe" stroke="#2563eb" strokeWidth="1"/>
              <circle cx="90" cy="90" r="10" fill="#dbeafe" stroke="#2563eb" strokeWidth="1"/>
              <circle cx="90" cy="120" r="10" fill="#dbeafe" stroke="#2563eb" strokeWidth="1"/>
              <text x="90" y="155" textAnchor="middle" fontSize="16" fill="#888">⋮</text>
              <circle cx="90" cy="190" r="10" fill="#dbeafe" stroke="#2563eb" strokeWidth="1"/>
              <circle cx="90" cy="220" r="10" fill="#dbeafe" stroke="#2563eb" strokeWidth="1"/>
              <circle cx="90" cy="250" r="10" fill="#dbeafe" stroke="#2563eb" strokeWidth="1"/>
              <text x="90" y="272" textAnchor="middle" fontSize="9.5" fill="#3b82f6">63 neurons</text>

              {/* Connections */}
              <g opacity="0.15" stroke="#2563eb" strokeWidth="0.8" fill="none">
                <line x1="100" y1="60" x2="220" y2="68"/>
                <line x1="100" y1="60" x2="220" y2="98"/>
                <line x1="100" y1="60" x2="220" y2="128"/>
                <line x1="100" y1="90" x2="220" y2="68"/>
                <line x1="100" y1="90" x2="220" y2="98"/>
                <line x1="100" y1="90" x2="220" y2="128"/>
                <line x1="100" y1="120" x2="220" y2="68"/>
                <line x1="100" y1="120" x2="220" y2="98"/>
                <line x1="100" y1="220" x2="220" y2="168"/>
                <line x1="100" y1="220" x2="220" y2="198"/>
                <line x1="100" y1="250" x2="220" y2="168"/>
                <line x1="100" y1="250" x2="220" y2="198"/>
              </g>

              {/* Hidden 1 */}
              <circle cx="250" cy="68" r="11" fill="#fef3c7" stroke="#b45309" strokeWidth="1"/>
              <circle cx="250" cy="98" r="11" fill="#fef3c7" stroke="#b45309" strokeWidth="1"/>
              <circle cx="250" cy="128" r="11" fill="#fef3c7" stroke="#b45309" strokeWidth="1"/>
              <text x="250" y="158" textAnchor="middle" fontSize="16" fill="#888">⋮</text>
              <circle cx="250" cy="168" r="11" fill="#fef3c7" stroke="#b45309" strokeWidth="1"/>
              <circle cx="250" cy="198" r="11" fill="#fef3c7" stroke="#b45309" strokeWidth="1"/>
              <text x="250" y="226" textAnchor="middle" fontSize="9.5" fill="#b45309">128 neurons (ReLU)</text>

              <g opacity="0.15" stroke="#b45309" strokeWidth="0.8" fill="none">
                <line x1="261" y1="68" x2="399" y2="88"/>
                <line x1="261" y1="68" x2="399" y2="118"/>
                <line x1="261" y1="98" x2="399" y2="88"/>
                <line x1="261" y1="128" x2="399" y2="118"/>
                <line x1="261" y1="168" x2="399" y2="148"/>
                <line x1="261" y1="198" x2="399" y2="178"/>
              </g>

              {/* Hidden 2 */}
              <circle cx="430" cy="88" r="11" fill="#ccfbf1" stroke="#0f766e" strokeWidth="1"/>
              <circle cx="430" cy="118" r="11" fill="#ccfbf1" stroke="#0f766e" strokeWidth="1"/>
              <text x="430" y="148" textAnchor="middle" fontSize="16" fill="#888">⋮</text>
              <circle cx="430" cy="148" r="11" fill="#ccfbf1" stroke="#0f766e" strokeWidth="1"/>
              <circle cx="430" cy="178" r="11" fill="#ccfbf1" stroke="#0f766e" strokeWidth="1"/>
              <text x="430" y="210" textAnchor="middle" fontSize="9.5" fill="#0f766e">64 neurons (ReLU)</text>

              <g opacity="0.15" stroke="#0f766e" strokeWidth="0.8" fill="none">
                <line x1="441" y1="88" x2="579" y2="98"/>
                <line x1="441" y1="88" x2="579" y2="128"/>
                <line x1="441" y1="118" x2="579" y2="98"/>
                <line x1="441" y1="148" x2="579" y2="148"/>
                <line x1="441" y1="178" x2="579" y2="178"/>
              </g>

              {/* Hidden 3 */}
              <circle cx="610" cy="98" r="11" fill="#ede9fe" stroke="#6d28d9" strokeWidth="1"/>
              <circle cx="610" cy="128" r="11" fill="#ede9fe" stroke="#6d28d9" strokeWidth="1"/>
              <text x="610" y="158" textAnchor="middle" fontSize="16" fill="#888">⋮</text>
              <circle cx="610" cy="168" r="11" fill="#ede9fe" stroke="#6d28d9" strokeWidth="1"/>
              <text x="610" y="200" textAnchor="middle" fontSize="9.5" fill="#6d28d9">32 neurons (ReLU)</text>

              <g opacity="0.15" stroke="#c2410c" strokeWidth="0.8" fill="none">
                <line x1="621" y1="98" x2="718" y2="105"/>
                <line x1="621" y1="98" x2="718" y2="155"/>
                <line x1="621" y1="128" x2="718" y2="105"/>
                <line x1="621" y1="168" x2="718" y2="205"/>
              </g>

              {/* Output */}
              <circle cx="730" cy="105" r="12" fill="#ffedd5" stroke="#c2410c" strokeWidth="1.5"/>
              <text x="730" cy="105" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#9a3412" y="109">A</text>
              <circle cx="730" cy="140" r="12" fill="#ffedd5" stroke="#c2410c" strokeWidth="1"/>
              <text x="730" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#9a3412" y="144">B</text>
              <text x="730" y="175" textAnchor="middle" fontSize="16" fill="#888">⋮</text>
              <circle cx="730" cy="195" r="12" fill="#ffedd5" stroke="#c2410c" strokeWidth="1"/>
              <text x="730" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#9a3412" y="199">Z</text>
              <text x="730" y="225" textAnchor="middle" fontSize="9.5" fill="#c2410c">26 neurons (Softmax)</text>
            </svg>
            <div className="text-xs text-black/40 font-medium tracking-wide mt-8 mb-2 italic text-center w-full uppercase">Figure 3 — MLP architecture for static ASL letter recognition (Option A)</div>
          </div>

          <p className="text-lg leading-relaxed text-black/70 mb-6 font-light">The Softmax output layer converts raw scores into probabilities. For example: 92% "A", 5% "E", 3% other. This probability distribution is critical for the thresholding logic in Step 5.</p>
        </div>

        {/* STEP 4 */}
        <div className="glass-panel p-8 md:p-12 mb-10 animate-spring-up rounded-[2rem] w-full text-left">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40 font-semibold mb-2 flex items-center gap-3"><div className="w-8 h-[1px] bg-black/10"></div>Step 04</div>
          <h2 className="text-3xl font-semibold tracking-tight font-['Inter'] text-black/90 mb-6">Training and Exporting the Model</h2>
          <p className="text-lg leading-relaxed text-black/70 mb-6 font-light">Use PyTorch or TensorFlow/Keras in Python. The training process is straightforward for the MLP architecture — the data is already clean, structured, and normalized from Step 1.</p>

          <ul className="flex flex-col gap-4 my-8">
            <li>
              <span className="num glass-panel px-4 py-2 font-bold shadow-sm inline-block mr-4">1</span>
              <span className="glass-panel px-4 py-2 rounded-full shadow-sm text-black/80"><strong className="font-medium text-black/90">Split the data.</strong> Use 80% of your CSV rows for training, hold back 20% as an unseen test set to measure real-world generalization.</span>
            </li>
            <li>
              <span className="num glass-panel px-4 py-2 font-bold shadow-sm inline-block mr-4">2</span>
              <span className="glass-panel px-4 py-2 rounded-full shadow-sm text-black/80"><strong className="font-medium text-black/90">Choose loss and optimizer.</strong> Use Categorical Crossentropy for the loss function (multi-class classification) and Adam as the optimizer.</span>
            </li>
            <li>
              <span className="num glass-panel px-4 py-2 font-bold shadow-sm inline-block mr-4">3</span>
              <span className="glass-panel px-4 py-2 rounded-full shadow-sm text-black/80"><strong className="font-medium text-black/90">Train to 95%+ test accuracy.</strong> With clean landmark data, this is achievable. If accuracy plateaus, add more diverse training samples.</span>
            </li>
            <li>
              <span className="num glass-panel px-4 py-2 font-bold shadow-sm inline-block mr-4">4</span>
              <span className="glass-panel px-4 py-2 rounded-full shadow-sm text-black/80"><strong className="font-medium text-black/90">Export the weights.</strong> Save as <code>.h5</code> (TensorFlow/Keras) or <code>.pt</code> (PyTorch). This file is your model's "brain" — load it in the server without retraining.</span>
            </li>
          </ul>

          <div className="border-l-4 border-emerald-500 bg-emerald-50/50 p-6 rounded-r-2xl my-6 text-black/80 backdrop-blur-sm">
            <strong className="text-xs font-bold uppercase tracking-widest mb-2 block text-emerald-700">Target Metric</strong>
            Aim for ≥ 95% accuracy on the held-out test set before deploying. Lower accuracy means the model will produce noisy, unpredictable output in the real-time pipeline — garbage in, garbage out.
          </div>
        </div>

        {/* STEP 5 */}
        <div className="glass-panel p-8 md:p-12 mb-10 animate-spring-up rounded-[2rem] w-full text-left">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40 font-semibold mb-2 flex items-center gap-3"><div className="w-8 h-[1px] bg-black/10"></div>Step 05</div>
          <h2 className="text-3xl font-semibold tracking-tight font-['Inter'] text-black/90 mb-6">The Real-Time Inference Pipeline</h2>
          <p className="text-lg leading-relaxed text-black/70 mb-6 font-light">This is where your live web application meets the trained model. The browser sends raw landmark coordinates over WebSocket, the Python backend preprocesses and predicts, then sends back the translated letter — dozens of times per second.</p>

          <div className="bg-white/40 border border-white/60 rounded-[2rem] pt-10 pb-6 px-6 mx-auto my-12 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col items-center max-w-4xl overflow-x-auto w-full svg-container relative"><div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent rounded-[2rem] pointer-events-none"></div>
            <svg width="100%" viewBox="0 0 760 380" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="arr4" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
                <marker id="arr4r" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
              </defs>
              <rect x="20" y="30" width="170" height="320" rx="12" fill="#f8f9ff" stroke="#c7d2fe" strokeWidth="1.5"/>
              <text x="105" y="56" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#3730a3">Browser</text>
              <rect x="36" y="68" width="138" height="42" rx="6" fill="#dbeafe" stroke="#93c5fd" strokeWidth="0.8"/>
              <text x="105" y="88" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#1e40af">MediaPipe</text>
              <text x="105" y="103" textAnchor="middle" fontSize="9.5" fill="#3b82f6">Detect 21 landmarks</text>
              <rect x="36" y="128" width="138" height="42" rx="6" fill="#dbeafe" stroke="#93c5fd" strokeWidth="0.8"/>
              <text x="105" y="148" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#1e40af">WebSocket send</text>
              <text x="105" y="163" textAnchor="middle" fontSize="9.5" fill="#3b82f6">63 raw coords →</text>
              <rect x="36" y="260" width="138" height="48" rx="6" fill="#ede9fe" stroke="#c4b5fd" strokeWidth="0.8"/>
              <text x="105" y="280" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#5b21b6">Display result</text>
              <text x="105" y="296" textAnchor="middle" fontSize="9.5" fill="#6d28d9">Show translated text</text>
              <line x1="105" y1="170" x2="105" y2="258" stroke="#c7d2fe" strokeWidth="1" strokeDasharray="3 3"/>
              <text x="105" y="216" textAnchor="middle" fontSize="9.5" fill="#818cf8">← result</text>
              <line x1="190" y1="149" x2="258" y2="149" stroke="#1a1a1a" strokeWidth="1.4" markerEnd="url(#arr4)"/>
              <text x="224" y="140" textAnchor="middle" fontSize="9.5" fill="#888">WS →</text>
              <rect x="260" y="30" width="480" height="320" rx="12" fill="#fffbf0" stroke="#fde68a" strokeWidth="1.5"/>
              <text x="500" y="56" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#78350f">Python Backend (FastAPI)</text>
              <rect x="278" y="68" width="140" height="48" rx="6" fill="#fef3c7" stroke="#fbbf24" strokeWidth="0.8"/>
              <text x="348" y="89" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#78350f">① Receive</text>
              <text x="348" y="106" textAnchor="middle" fontSize="9.5" fill="#b45309">63 raw coordinates</text>
              <line x1="348" y1="116" x2="348" y2="136" stroke="#888" strokeWidth="1.2" markerEnd="url(#arr4)"/>
              <rect x="278" y="138" width="140" height="48" rx="6" fill="#fef3c7" stroke="#fbbf24" strokeWidth="0.8"/>
              <text x="348" y="159" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#78350f">② Preprocess</text>
              <text x="348" y="176" textAnchor="middle" fontSize="9.5" fill="#b45309">Normalize</text>
              <line x1="348" y1="186" x2="348" y2="206" stroke="#888" strokeWidth="1.2" markerEnd="url(#arr4)"/>
              <rect x="278" y="208" width="140" height="48" rx="6" fill="#ccfbf1" stroke="#6ee7b7" strokeWidth="0.8"/>
              <text x="348" y="229" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#065f46">③ Predict</text>
              <text x="348" y="246" textAnchor="middle" fontSize="9.5" fill="#0f766e">Feed into model</text>
              <line x1="418" y1="232" x2="448" y2="232" stroke="#888" strokeWidth="1.2" markerEnd="url(#arr4)"/>
              <rect x="450" y="200" width="140" height="80" rx="6" fill="#ffedd5" stroke="#fb923c" strokeWidth="0.8"/>
              <text x="520" y="222" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#9a3412">④ Threshold</text>
              <text x="520" y="239" textAnchor="middle" fontSize="9.5" fill="#c2410c">Confidence &lt; 80%?</text>
              <text x="520" y="255" textAnchor="middle" fontSize="9.5" fill="#c2410c">→ output nothing</text>
              <text x="520" y="270" textAnchor="middle" fontSize="9.5" fill="#c2410c">≥ 80% → continue</text>
              <line x1="590" y1="240" x2="618" y2="240" stroke="#888" strokeWidth="1.2" markerEnd="url(#arr4)"/>
              <rect x="620" y="200" width="100" height="80" rx="6" fill="#ede9fe" stroke="#c4b5fd" strokeWidth="0.8"/>
              <text x="670" y="222" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#5b21b6">⑤ Smooth</text>
              <text x="670" y="239" textAnchor="middle" fontSize="9.5" fill="#6d28d9">10 consecutive</text>
              <text x="670" y="255" textAnchor="middle" fontSize="9.5" fill="#6d28d9">same prediction</text>
              <text x="670" y="271" textAnchor="middle" fontSize="9.5" fill="#6d28d9">→ send letter</text>
              <path d="M670 280 L670 365 L105 365 L105 308" fill="none" stroke="#2563eb" strokeWidth="1.4" strokeDasharray="5 3" markerEnd="url(#arr4r)"/>
              <text x="400" y="358" textAnchor="middle" fontSize="9.5" fill="#2563eb" fontWeight="500">WS response — letter confirmed</text>
            </svg>
            <div className="text-xs text-black/40 font-medium tracking-wide mt-8 mb-2 italic text-center w-full uppercase">Figure 4 — Full real-time inference pipeline from browser to model and back</div>
          </div>

          <p className="text-lg leading-relaxed text-black/70 mb-6 font-light">Two critical mechanisms prevent the output from being noisy or unreliable:</p>

          <div className="grid md:grid-cols-2 gap-8 my-10">
            <div className="bg-white/40 border border-white/60 rounded-[2rem] p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-500 relative overflow-hidden group">
              <div className="text-xs font-bold uppercase tracking-widest mb-4 opacity-80" style={{ color: 'var(--coral)' }}>Mechanism 1</div>
              <h4 className="text-2xl font-bold mb-4 font-['Inter'] text-black/90">Confidence Thresholding</h4>
              <p className="text-lg leading-relaxed text-black/70 mb-6 font-light">The Softmax output gives probabilities. Only accept a prediction if confidence exceeds a threshold (e.g., 80%). If the model is 40% sure, output nothing — the user might just be adjusting their hand.</p>
            </div>
            <div className="bg-white/40 border border-white/60 rounded-[2rem] p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-500 relative overflow-hidden group">
              <div className="text-xs font-bold uppercase tracking-widest mb-4 opacity-80" style={{ color: 'var(--purple)' }}>Mechanism 2</div>
              <h4 className="text-2xl font-bold mb-4 font-['Inter'] text-black/90">Temporal Smoothing</h4>
              <p className="text-lg leading-relaxed text-black/70 mb-6 font-light">Don't update the screen every frame (30× per second) or letters will flicker wildly. Only confirm a prediction after the model has output the same letter for 10 consecutive frames.</p>
            </div>
          </div>

          <div className="border-l-4 border-purple-500 bg-purple-50/50 p-6 rounded-r-2xl my-6 text-black/80 backdrop-blur-sm">
            <strong className="text-xs font-bold uppercase tracking-widest mb-2 block text-purple-700">Critical Implementation Note</strong>
            The preprocessing applied in the server must be <em className="italic text-black/90 font-medium">identical</em> to what was used during training — same wrist subtraction, same normalization range. Even a small deviation causes accuracy to degrade significantly at inference time.
          </div>
        </div>

        {/* SUMMARY */}
        <div className="glass-panel p-8 md:p-12 mb-10 animate-spring-up rounded-[2rem] w-full text-left">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40 font-semibold mb-2 flex items-center gap-3"><div className="w-8 h-[1px] bg-black/10"></div>Summary</div>
          <h2 className="text-3xl font-semibold tracking-tight font-['Inter'] text-black/90 mb-6">The Full System at a Glance</h2>

          <div className="bg-white/40 border border-white/60 rounded-[2rem] pt-10 pb-6 px-6 mx-auto my-12 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col items-center max-w-4xl overflow-x-auto w-full svg-container relative"><div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent rounded-[2rem] pointer-events-none"></div>
            <svg width="100%" viewBox="0 0 760 100" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="arr5" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
              </defs>
              <rect x="10" y="28" width="120" height="40" rx="8" fill="#dbeafe" stroke="#2563eb" strokeWidth="1"/>
              <text x="70" y="53" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#1e40af">Data Eng.</text>
              <line x1="130" y1="48" x2="158" y2="48" stroke="#888" strokeWidth="1.2" markerEnd="url(#arr5)"/>

              <rect x="160" y="28" width="120" height="40" rx="8" fill="#fef3c7" stroke="#b45309" strokeWidth="1"/>
              <text x="220" y="53" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#78350f">Dataset</text>
              <line x1="280" y1="48" x2="308" y2="48" stroke="#888" strokeWidth="1.2" markerEnd="url(#arr5)"/>

              <rect x="310" y="28" width="120" height="40" rx="8" fill="#ccfbf1" stroke="#0f766e" strokeWidth="1"/>
              <text x="370" y="53" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#134e4a">Architecture</text>
              <line x1="430" y1="48" x2="458" y2="48" stroke="#888" strokeWidth="1.2" markerEnd="url(#arr5)"/>

              <rect x="460" y="28" width="120" height="40" rx="8" fill="#ede9fe" stroke="#6d28d9" strokeWidth="1"/>
              <text x="520" y="53" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#4c1d95">Training</text>
              <line x1="580" y1="48" x2="608" y2="48" stroke="#888" strokeWidth="1.2" markerEnd="url(#arr5)"/>

              <rect x="610" y="28" width="135" height="40" rx="8" fill="#ffedd5" stroke="#c2410c" strokeWidth="1.5"/>
              <text x="677" y="53" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#9a3412">Live Pipeline</text>
            </svg>
            <div className="text-xs text-black/40 font-medium tracking-wide mt-8 mb-2 italic text-center w-full uppercase">Figure 5 — The five-step development pipeline</div>
          </div>

          <p className="text-lg leading-relaxed text-black/70 mb-6 font-light">Each step builds directly on the previous. The invariance established in Step 1 must be honored in Steps 2 (collection), 4 (training), and 5 (inference) — consistency across all three is what makes the system robust to real-world variation in hand size, distance, and screen position.</p>
        </div>
    </main>
  );
};

export default Methodology;
