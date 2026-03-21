import re
import os

files = [
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
    
    # Update the linear gradient to richer sand/latte tones and make animation 15s
    content = content.replace(
        'background: linear-gradient(-45deg, #fdfbf7, #f5ebd9, #faf5eb, #ebe0c8);',
        'background: linear-gradient(-45deg, #FFF9F0, #F0E0C8, #FBF0DF, #E4D0AB);'
    )
    content = content.replace(
        'animation: gradientBG 20s ease infinite;',
        'animation: gradientBG 15s ease infinite;'
    )
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("Updated internal background colors!")
