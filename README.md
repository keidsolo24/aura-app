# AURORA v2 — Liquid + Atmos

Novy cisty vzhled podle platna v2 a 15 pravidel UI.

## Nasazeni (GitHub Pages)
Nahraj OBSAH teto slozky do repa misto verze 07.1 (index.html v rootu, vedle assets/, fonts/, icons/, manifest.webmanifest).
Data zustanou: stejne uloziste (IndexedDB `aurora-test-local-v1`, SCHEMA 6) a stejny Supabase sync.

## Uprava
Zdroje jsou v `source/`:
- v2.js / v2.css / app.html — nove obrazovky a vzhled
- model.js, store.js, cloud-*.js, supabase.js — datova vrstva z 07.1 (beze zmen)
- intro.js — Aurora Intro
Po zmene spust `python build.py` a nahraj novy index.html.
