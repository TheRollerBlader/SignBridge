import re
import os

files = [
    'c:\\workspace\\SignBridge\\frontend\\index.html',
    'c:\\workspace\\SignBridge\\frontend\\demo.html',
    'c:\\workspace\\SignBridge\\frontend\\technology.html',
    'c:\\workspace\\SignBridge\\frontend\\methodology.html',
    'c:\\workspace\\SignBridge\\frontend\\team.html',
    'c:\\workspace\\SignBridge\\frontend\\old.html'
]

for f in files:
    if not os.path.exists(f): 
        continue
        
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Remove the call button. Look for <button class="glass-btn p-2 rounded-full...> to </button>
    content = re.sub(
        r'<button class="glass-btn p-2 rounded-full text-black/60">.*?</button>\s*',
        '',
        content,
        flags=re.DOTALL
    )
    
    # Update the VIEW REPO link
    content = content.replace(
        '<a href="#" class="btn-repo glass-btn px-6 py-2.5 rounded-full text-black/80">',
        '<a href="https://github.com/TheRollerBlader/SignBridge.git" target="_blank" class="btn-repo glass-btn px-6 py-2.5 rounded-full text-black/80">'
    )
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("Updated nav bar buttons on all pages!")
