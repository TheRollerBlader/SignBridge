import re

files = [
    'c:\\workspace\\SignBridge\\frontend\\demo.html',
    'c:\\workspace\\SignBridge\\frontend\\technology.html',
    'c:\\workspace\\SignBridge\\frontend\\methodology.html',
    'c:\\workspace\\SignBridge\\frontend\\team.html'
]

COMMON_HEAD = r'''<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>REPLACE_TITLE</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700;800&display=swap" rel="stylesheet">
    <style>
        body { 
            font-family: 'Outfit', sans-serif; 
            background: linear-gradient(135deg, #fdfbfa 0%, #f6f3ee 100%);
            color: #2c2b29; 
            overflow-x: hidden; 
            min-height: 100vh;
        }
        
        ::selection { background: rgba(46, 204, 113, 0.2); color: #1a1a1a; }

        .glass-panel, .glass-btn, .glass-nav {
            background: rgba(255, 255, 255, 0.4);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            box-shadow: 0 4px 24px -1px rgba(0, 0, 0, 0.02), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
            transition: all 0.8s cubic-bezier(0.19, 1, 0.22, 1);
        }

        .glass-btn:hover {
            background: rgba(255, 255, 255, 0.7);
            box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.04), inset 0 0 0 1px rgba(255, 255, 255, 0.8);
            transform: translateY(-2px);
        }

        /* Header Restore */
        .brand-text {
            font-family: 'Inter', sans-serif;
            font-size: 0.875rem;
            font-weight: 800;
            letter-spacing: -0.05em;
            color: rgba(0,0,0,0.8);
        }

        .btn-repo {
            font-family: 'Inter', sans-serif;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
        }

        .nav-link {
            font-family: 'Inter', sans-serif;
            font-size: 0.75rem;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: rgba(44, 43, 41, 0.6);
            transition: all 0.6s cubic-bezier(0.19, 1, 0.22, 1);
            position: relative;
        }

        .nav-link.active {
            color: rgba(44, 43, 41, 1);
        }

        .nav-link::after {
            content: ''; position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); width: 0; height: 1px; background: rgba(44, 43, 41, 0.8); transition: width 0.6s cubic-bezier(0.19, 1, 0.22, 1);
        }
        .nav-link:hover { color: rgba(44, 43, 41, 1); }
        .nav-link:hover::after, .nav-link.active::after { width: 100%; }

        .light-glow {
            position: absolute; width: 40vw; height: 40vw; background: radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 70%); top: -10vw; left: 50%; transform: translateX(-50%); z-index: -1; pointer-events: none;
        }

        .animate-spring-up {
            animation: floatUpSpring 1.8s cubic-bezier(0.19, 1, 0.22, 1) forwards;
            opacity: 0; will-change: transform, opacity, filter;
        }
        
        @keyframes floatUpSpring {
            0% { opacity: 0; transform: translateY(50px) scale(0.98); filter: blur(8px); }
            100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }

        .content-card { background: rgba(255, 255, 255, 0.4); backdrop-filter: blur(20px); border-radius: 1.5rem; padding: 2.5rem; box-shadow: 0 4px 24px -1px rgba(0, 0, 0, 0.02), inset 0 0 0 1px rgba(255, 255, 255, 0.5); margin-bottom: 2rem; border: none !important; }
    </style>
</head>'''

NAV_TEMPLATE = r'''<body class="min-h-screen flex flex-col relative overflow-x-hidden">
    <!-- Ambient Diffused Lighting -->
    <div class="light-glow"></div>

    <!-- Navigation -->
    <nav class="flex items-center justify-between px-8 md:px-16 py-8 animate-spring-up w-full z-20">
        <a href="index.html" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-black/80">
                <path d="M4 12C4 12 7 8 12 8C17 8 20 12 20 12" stroke="currentColor" stroke-width="2.5"
                    stroke-linecap="round" />
                <circle cx="7" cy="14" r="2" fill="currentColor" />
                <circle cx="17" cy="14" r="2" fill="currentColor" />
            </svg>
            <span class="brand-text">PROJECT SIGNBRIDGE</span>
        </a>

        <div class="hidden md:flex items-center gap-10 glass-nav px-8 py-3 rounded-full">
            <a href="technology.html" class="nav-link REPLACE_TECH_ACTIVE">TECHNOLOGY</a>
            <a href="methodology.html" class="nav-link REPLACE_METH_ACTIVE">METHODOLOGY</a>
            <a href="demo.html" class="nav-link REPLACE_DEMO_ACTIVE">DEMO</a>
            <a href="team.html" class="nav-link REPLACE_TEAM_ACTIVE">TEAM</a>
        </div>

        <div class="flex items-center gap-4">
            <button class="glass-btn p-2 rounded-full text-black/60">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path
                        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z">
                    </path>
                </svg>
            </button>
            <a href="#" class="btn-repo glass-btn px-6 py-2.5 rounded-full text-black/80">
                VIEW REPO
            </a>
        </div>
    </nav>'''

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Extract Title
    title_match = re.search(r'<title>(.*?)</title>', content)
    title = title_match.group(1) if title_match else 'Project Signbridge'
    
    # Replace Head
    new_head = COMMON_HEAD.replace('REPLACE_TITLE', title)
    content = re.sub(r'<head>.*?</head>', new_head, content, flags=re.DOTALL)
    
    # Configure Nav Active State
    nav = NAV_TEMPLATE
    nav = nav.replace('REPLACE_TECH_ACTIVE', 'active' if 'technology' in f else '')
    nav = nav.replace('REPLACE_METH_ACTIVE', 'active' if 'methodology' in f else '')
    nav = nav.replace('REPLACE_DEMO_ACTIVE', 'active' if 'demo' in f else '')
    nav = nav.replace('REPLACE_TEAM_ACTIVE', 'active' if 'team' in f else '')
    
    # Replace body and nav
    # The original body is usually <body class="min-h-screen flex flex-col">
    # And nav follows immediately. We replace everything from <body ...> to </nav>
    content = re.sub(r'<body.*?</nav>', nav, content, flags=re.DOTALL)
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("Updated all subpages")
