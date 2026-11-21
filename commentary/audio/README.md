# audio

Pre-rendered voice files referenced by a script line's `audio` field (path relative to `commentary/`).
One folder per script (`<script name>/<sheet id>.mp3`, made by `tools/synth.mjs`); `tools/wire-audio.mjs` writes the `audio` fields. A game with recorded files is voiced by them only; a line without a file stays silent.
Only files we have the right to publish or that we generated ourselves go here. Licence: CC BY 4.0 (see LICENSE); character names and personas stay reserved (/TRADEMARKS.md).
