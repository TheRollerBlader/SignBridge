import re
import os

files = [
    'c:\\workspace\\SignBridge\\frontend\\demo.html',
    'c:\\workspace\\SignBridge\\frontend\\technology.html',
    'c:\\workspace\\SignBridge\\frontend\\methodology.html',
    'c:\\workspace\\SignBridge\\frontend\\team.html',
    'c:\\workspace\\SignBridge\\frontend\\old.html'
]

NEW_FOOTER = r'''    <!-- Footer -->
    <footer class="px-8 md:px-16 py-10 animate-spring-up delay-500 z-10 w-full relative border-t border-black/5 mt-10">
        <div class="flex flex-col md:flex-row items-center justify-between gap-10">
            <div class="flex items-center gap-3 footer-text font-medium text-[0.7rem] tracking-[0.1em]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
                <span class="uppercase">Private by Design</span>
            </div>

            <div class="flex flex-wrap justify-center items-center gap-10 grayscale opacity-30 text-xs tracking-wider">
                <span class="font-light">Hackathon '24</span>
                <span class="font-serif italic text-sm">DeepMind</span>
                <span class="font-medium">MediaPipe</span>
                <span class="font-mono">PyTorch</span>
            </div>

            <div class="flex items-center gap-4 footer-text font-medium text-[0.65rem] tracking-[0.15em] uppercase">
                <span>Explore</span>
                <div class="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center group hover:bg-white/50 transition-colors duration-500 cursor-pointer">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round" class="transform group-hover:translate-y-0.5 transition-transform duration-500">
                        <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
                    </svg>
                </div>
            </div>
        </div>
    </footer>'''

for f in files:
    if not os.path.exists(f): 
        continue
        
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    content = re.sub(r'<!-- Footer -->.*?</footer>', NEW_FOOTER, content, flags=re.DOTALL)
    
    # Soften rigid typography matching the "organic" style of index
    content = content.replace('text-5xl md:text-6xl font-extrabold', 'text-5xl md:text-6xl font-light tracking-wide delay-100')
    content = content.replace('font-bold tracking-tight', 'font-medium tracking-wide')
    content = content.replace('font-extrabold', 'font-semibold')
    
    # Adding animation classes to main containers
    content = content.replace('<main class="flex-grow flex flex-col items-center px-6 pt-10 pb-20 w-full max-w-6xl mx-auto">', '<main class="flex-grow flex flex-col items-center px-6 pt-10 pb-20 w-full max-w-6xl mx-auto animate-spring-up">')
    content = content.replace('<main class="flex-grow flex flex-col items-center px-6 pt-10 pb-20 w-full max-w-4xl mx-auto">', '<main class="flex-grow flex flex-col items-center px-6 pt-10 pb-20 w-full max-w-4xl mx-auto animate-spring-up">')

    # Fix any lingering buttons to use glass 
    content = content.replace('content-card', 'content-card glass-panel')
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("Updated footer and internal styles")
