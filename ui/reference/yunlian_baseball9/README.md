# Reference: yunlian-temple 九宮格棒球 (owner's own code)

Read-only source for issue #332 (batting + pitching training mini-game). Do not load these files from the site.

- `prototype.html`: standalone three.js r128 one-pager. Game rules, AI and physics live in it (you bat with guess modes one/row/col/box/take/bunt; you pitch with pitch type + target cell, with stamina).
- `overlay_wrapper.js`: how yunlian-temple wraps the prototype as an overlay (own canvas, loop runs only while open). Its game body is `bb9_game()`; names there are `bb9_*`.

Copied from sunososobro-hub/yunlian-temple at 34a8e0e (docs/design/baseball_9grid/index.html and src/7xbs_baseball9.js). Code is MIT like the rest of this repo.
