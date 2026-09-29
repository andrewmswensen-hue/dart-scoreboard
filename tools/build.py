"""Build the app from src/.

Writes:
  index.html            the GitHub Pages app (full document, installable)
  dart-scoreboard.html  the same page without <html>/<head>, for the Claude artifact
"""
import os, re
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here) if os.path.basename(here) == 'tools' else here
src = os.path.join(root, 'src') if os.path.isdir(os.path.join(root, 'src')) else root
read = lambda n: open(os.path.join(src, n), encoding='utf-8').read()
style, logic, ui, shell = read('style.css'), read('logic.js'), read('ui.js'), read('shell.html')
page = shell.replace('/*STYLE*/', style).replace('/*LOGIC*/', logic).replace('/*UI*/', ui)
assert '—' not in page, 'no em dashes'

HEAD = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Darts">
<meta name="description" content="Darts scoreboard for X01 and Cricket with computer opponents, statistics and the One Bust, Low Score house rule.">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" href="icon-192.png" sizes="192x192">
<link rel="manifest" href="manifest.webmanifest">
'''
m = re.match(r'\s*(<title>.*?</title>\s*<style>.*?</style>)(.*)', page, re.S)
full = HEAD + m.group(1) + '\n</head>\n<body>\n' + m.group(2).strip() + '\n</body>\n</html>\n'
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(full)
open(os.path.join(root, 'dart-scoreboard.html'), 'w', encoding='utf-8').write(page)
print('built index.html', len(full), 'bytes')
