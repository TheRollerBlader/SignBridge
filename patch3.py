import re
import os

files = [
    'c:\\workspace\\SignBridge\\frontend\\demo.html',
    'c:\\workspace\\SignBridge\\frontend\\technology.html',
    'c:\\workspace\\SignBridge\\frontend\\methodology.html',
    'c:\\workspace\\SignBridge\\frontend\\team.html',
    'c:\\workspace\\SignBridge\\frontend\\old.html'
]

NEW_BODY_CSS = r'''        body {
            font-family: 'Outfit', sans-serif;
            background: linear-gradient(-45deg, #fdfbf7, #f5ebd9, #faf5eb, #ebe0c8);
            background-size: 400% 400%;
            animation: gradientBG 20s ease infinite;
            color: #2c2b29;
            overflow-x: hidden;
            min-height: 100vh;
        }

        @keyframes gradientBG {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        ::selection {'''

for f in files:
    if not os.path.exists(f): 
        continue
        
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    content = re.sub(r'        body\s*\{.*?::selection\s*\{', NEW_BODY_CSS, content, flags=re.DOTALL)
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("Updated gradient styles")
