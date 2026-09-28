"""Build Aurora v2: inline source/ into one index.html. Standard library only."""
from pathlib import Path
import re
b = Path(__file__).resolve().parent; src = b / 'source'
s = (src / 'app.html').read_text(encoding='utf-8')
s = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: '<style data-source="' + m.group(1) + '">\n' + (src / m.group(1)).read_text(encoding='utf-8') + '\n</style>', s)
s = re.sub(r'<script src="([^"]+)"></script>', lambda m: '<script data-source="' + m.group(1) + '">\n' + (src / m.group(1)).read_text(encoding='utf-8').replace('</script', '<\\/script') + '\n</script>', s)
s = s.replace('<html lang="en"', '<html data-release="aurora-2.0" lang="en"', 1)
(b / 'index.html').write_text(s, encoding='utf-8')
print('Built index.html:', (b / 'index.html').stat().st_size, 'bytes')
