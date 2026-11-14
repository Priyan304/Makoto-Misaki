# Automatic avatar behavior

Automatic reactions are enabled when the avatar opens. Send a message normally;
there is no need to open the expression menu. The selected Ollama, Gemini or Grok
model chooses one of nine reactions alongside its ordinary response: neutral,
happy, affectionate, amused, curious, concerned, sad, surprised or angry. This
uses the same generation request, not an additional sentiment API call. The
bridge validates the metadata and keeps it out of chat text, exports and history.
These are character expressions, not claims about the user's mental state.

While waiting for the reply, a small local phrase matcher provides an immediate
cue for common messages such as “Thank you”, “I love you” or “I had a bad day”.
The model's contextual choice takes over when its response arrives. This matters
for sarcasm, negation, other languages and ambiguous wording. Models that omit or
return invalid metadata retain usable chat with the simple local cue. Cancelled
and failed requests clear the reaction, and stale replies cannot change it.

Idle motion uses the supplied model's existing rig: looking to either side, head
tilts, nods, shifting her weight and a soft smile, with breathing and irregular
blinks. The first gesture starts after 2–4 seconds of idle; subsequent gestures
last 2.5–4.5 seconds with 4–9 second pauses and do not repeat consecutively.
There are no authored `.motion3.json` clips in the supplied model, so this does
not add walking, dancing or an unsupported hand animation. The character's
framing and original assets are unchanged.

Reactions blend in, hold for approximately 18 seconds of visible animation time,
then fade over 6 seconds. Affection uses the supplied blush and heart-eye files;
other moods combine supported face/head parameters, with the supplied angry
expression for an appropriate angry reaction. Random smiles are suppressed
during concerned, sad or angry reactions. Outfit and eye-cover switches stay
manual. Any of the original seven expressions can still be selected from the
menu; manual faces last until the next submitted message while automatic mode is
on. Reset returns to automatic reactions. Uncheck **Automatic reactions** to use
only manual faces for that avatar session.

**Preferences → Reduced motion** (and the operating system's reduced-motion
setting) keeps the avatar still. Expressions still change on incoming messages.
Hidden documents pause the private 30 FPS ticker; returning does not fast-forward
through missed gestures. Parameters are restricted to IDs present in the loaded
rig and clamped to its authored bounds. No desktop action, screenshot or provider
request is triggered by idle behavior.

Implementation: `src/live2d/behavior.ts`, `src/live2d/Avatar.tsx`, and
`backend/emotions.py`. Poses apply after Cubism breathing and before physics, so
hair and clothing respond to the movement. Supplied expression files blend after
physics; parameter restoration prevents additive drift. See the upstream
[Cubism parameter documentation](https://docs.live2d.com/en/cubism-sdk-manual/parameters/)
and [adapter update documentation](https://guansss.github.io/pixi-live2d-display/models/).

Validation covers bounded gesture variation, reaction expiry and replacement,
hidden/reduced-motion pauses, all original expression files, pixel changes on the
real model, and isolated metadata/action validation for all three providers.
Provider tests use mocked responses; they do not measure live cloud inference
quality. Browser snapshots are written to `test-results/automatic-affection.png`
and `test-results/automatic-concern.png`.
