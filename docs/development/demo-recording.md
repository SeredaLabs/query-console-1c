# Recording localized demos

The README animations and videos show the built Classic WebView, not a recreated
UI. The current recordings were made for **0.1.89**. They use the public metadata
fixture in `test/e2e/harness/index.html`, the default text editor, and the actual
`en`, `uk`, and `ru` dictionaries. No database, private metadata, or VS Code window
is used. The script checks the final `insertText` message; it does not record the
Extension Host inserting a BSL string.

## Reproduce

Install the project's existing Node dependencies, Playwright Chromium, and Python
3 with Pillow available (`python3 -m pip install Pillow` in your chosen Python
environment). Set `PYTHON` to another interpreter path if needed; on Windows this
can be `python`. No system FFmpeg is needed: Playwright supplies its video encoder.

```bash
npm ci
npx playwright install chromium
npm run docs:record -- --check
npm run docs:record
npm run docs:check
```

Both recording commands build the current WebView first. `--check` runs all UI
actions and assertions without recording or replacing media; it does not need
Pillow. Use `--locale=uk` (or `en`, `ru`) to check or record just one language.
The server binds to a random loopback port and closes when the command finishes.

The recorder reuses the E2E fixture. Its optional `?locale=` selects the initial
UI language; without it, existing tests retain Russian. The surrounding title
strip is for explanatory captions and is not part of the extension UI.

## Outputs and review

- `docs/images/query-constructor-demo.gif` is the English README animation;
  `.uk.gif` and `.ru.gif` are the corresponding localized versions.
- `docs/videos/query-constructor-demo.{en,uk,ru}.webm` contain continuous browser
  recordings with localized captions and no audio. Linked videos can be paused
  and replayed; GIFs remain visible in README renderers without video support.
- `output/docs-demo/run-*/` retains raw recordings, PNG checkpoints, and frame
  durations for visual review. It is ignored by Git and packaging.

All requested languages must pass the assertions and GIF encoding before the
recorder starts copying media into documentation. A scenario or encoding failure
leaves existing published files unchanged. Review every generated locale before
committing: titles must fit, text and icons must be readable, and the error scene
must be followed by the preserved valid query. GIF frames use full replacement,
without fades that blend text from different screens.

The 16 scenes verify multi-word search, adding a source by dragging a field,
adding all fields with duplicate aliases, the new custom expression editor
(field search and type, function snippets and inline help, completion, Tab between
arguments, syntax diagnostics, formatting availability, and saving an expression
into the generated SDBL), generated SDBL, applying text edits,
condition/order synchronization, rejection of an unknown table, preservation of
the previous model, and the outgoing insertion text. Captions live in
`tooling/docs-demo/captions.json`; the scenario and assertions live in
`tooling/docs-demo/record.mjs`. The GIF encoder uses actual screenshot checkpoints.
The expression editor is part of the stable designer. Its diagnostics are advisory:
an unfinished expression disables formatting but does not disable the dialog's OK.
The scenario corrects the expression before saving and verifies it in the query.

Update all three captions and the [English walkthrough](../en/query-designer.md)
with its Ukrainian and Russian translations when changing the scenario. Keep
metadata identifiers and SDBL keywords intact. Re-record after relevant UI changes
and update the version above. Do not present Canvas or Query text v2 as default
behavior; demonstrations of those features need an explicit experimental label.

The three GIFs are packaged for localized README previews. WebM files stay in the
repository and are excluded from VSIX; Marketplace video links resolve to GitHub.
