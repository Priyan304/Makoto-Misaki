# Automatic avatar behavior

Automatic reactions are enabled when the avatar opens. Send a message normally;
there is no need to open the expression menu. The selected Ollama, Gemini or Grok
model chooses a reaction alongside its ordinary response: neutral, happy,
affectionate, amused, curious, concerned, sad, surprised, angry, embarrassed,
thinking, relieved or sleepy. This
uses the same generation request, not an additional sentiment API call. The
bridge validates the metadata and keeps it out of chat text, exports and history.
The response processor separates `message`, `emotion`, `expression`, `motion`
and `intensity`; the API retains `reply` as a compatibility alias for `message`.
Recognized stage directions such as `*smiles and blushes*` or `(nods)` become
cosmetic metadata instead of dialogue. Quoted examples, code blocks, inline code
and ordinary emphasis remain text. Unknown motion/expression names cannot reach
the rig. A malformed JSON reply gets a readable retry message without actions.
Gemini receives a JSON response schema; other models retain prompt-based output
and the existing plain-text/legacy `reply` fallback. Persona text stays separate
from the output contract and is not rewritten by this feature.
These are character expressions, not claims about the user's mental state.

While waiting for the reply, a small local phrase matcher provides an immediate
cue for common messages such as “Thank you”, “I love you” or “I had a bad day”.
The model's contextual choice takes over when its response arrives. This matters
for sarcasm, negation, other languages and ambiguous wording. Models that omit or
return invalid metadata retain usable chat with the simple local cue. Cancelled
and failed requests clear the reaction, and stale replies cannot change it.

Idle motion uses the supplied model's existing rig: looking to either side, head
tilts, nods, shifting her weight and a soft smile, with breathing and irregular
blinks. The independent `IdleBehaviorController` uses weighted selection, avoids
consecutive repeats, and gives common gestures a 12-second cooldown and rare
sleepy/yawn/pout gestures a 60-second cooldown. The first gesture starts after
2–4 seconds; subsequent gestures last 2.5–4.5 seconds with 4–9 second pauses.
States progress from idle to waiting (30 seconds), bored (90 seconds), and
sleepy (configurable, default 10 minutes). Interaction produces a brief attention
state, chatting uses conversation, and a running desktop task uses executing.
Task completion and failure produce happy and concerned reactions respectively.
Dialogue may request a single nod, head shake, look around, yawn, laugh or
thinking gesture. These play once, rather than looping on every rendered frame.
There are no authored `.motion3.json` clips in the supplied model, so this does
not add walking, dancing or an unsupported hand animation. The character's
framing and original assets are unchanged.

Reactions blend in, hold for approximately 18 seconds of visible animation time,
then fade over 6 seconds. Affection uses the supplied blush and heart-eye files;
other moods combine supported face/head parameters, with the supplied angry
expression for an appropriate angry reaction. Random smiles are suppressed
during concerned, sad or angry reactions. Outfit and eye-cover switches stay
manual. Any of the original seven expressions can still be selected from the
menu; manual faces last until the next conversational reaction while automatic mode is
on. Reset returns to automatic reactions. Uncheck **Automatic reactions** to use
only manual faces for that avatar session.

**Preferences → Reduced motion** (and the operating system's reduced-motion
setting) keeps the avatar still. Expressions still change on incoming messages.
Hidden documents pause the private 30 FPS ticker; returning does not fast-forward
through missed gestures. Parameters are restricted to IDs present in the loaded
rig and clamped to its authored bounds. Ambient animation never calls a provider.

**Preferences → Companion behavior** provides independent random-gesture and
sleepy-behavior switches, animation intensity, sleepy timing, and optional
conversation starters. Starters are **off by default**. When enabled they use the
selected model (Gemini, Grok or local); cloud requests may be billed. Frequency is
2/3/5/10 minutes since interaction with Misaki, plus up to 35% random delay, and
the minimum message cooldown is 5/10/20/30 minutes. This measures activity within
Misaki, not global keyboard monitoring or a claim to know what the user is doing.

Only one starter is attempted per uninterrupted quiet stretch. User interaction
rearms it, subject to cooldown; failure does not trigger repeated automatic API
retries. Duplicate recent messages are suppressed. Typing, provider changes,
clearing the conversation, disabling the feature, hiding the app or unmounting
cancels pending generation. Drafts, settings pages, dialogs, desktop execution,
playing music in Misaki and browser speech playback suppress starters. Music is
checked again before delivering a generated reply. Requests contain only bounded
history for the selected provider: no screenshot or desktop observations. The
bridge rejects desktop capabilities on an idle request and strips any actions
returned by the model; the UI also refuses to display idle action proposals.
Starters appear as assistant messages, never fabricated user turns.

Implementation: `src/live2d/behavior.ts`, `src/live2d/Avatar.tsx`, and
`backend/response_processor.py`, `src/live2d/IdleBehaviorController.ts`, and
`src/companion/useIdleCompanion.ts`. Poses apply after Cubism breathing and before physics, so
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
