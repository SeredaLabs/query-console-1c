# Approved Visual References

Ця папка призначена для approved screenshots New Builder.

Очікувані файли:

``` text
structure.png
fields.png
conditions.png
grouping.png
sorting.png
additional.png
package.png
union.png
```

У цей pack навмисно НЕ додані фальшиві placeholder PNG.

Якщо є затверджені прототипи, поклади їх сюди з цими іменами перед
visual implementation.

## Priority

Для presentation:

`approved screenshot → visual spec → roadmap → current implementation`

Для functionality:

`repository/domain → capability map → roadmap → visual spec`

Screenshot не може створити capability, якого немає в domain model.

## Preview Access

Canvas is bundled with the normal extension package but remains off by default.
To test it, enable `queryConsole.enableNewBuilderPreview` in VS Code Settings,
then run `1C: New Builder (Preview)` from Command Palette. The visual interface
is still under development and does not replace the Classic Constructor.

Current checkpoint: the baseline roadmap through Phase 12 is implemented,
including real query load/save, all six workspaces, package/UNION navigation,
and temporary-table continuity. Phase 13 (manual temporary-table editing and
source-subquery drill-down) is the next main implementation phase.
[Verification now covers](../../development/testing-and-release.md#canvas-verification)
representative Classic/Canvas parity, Canvas edits/Save guards and real VS Code
source insertion. Broader feature coverage remains incomplete; the preview flag
remains intentional.

For contributor debugging, `F5` or `npm run preview:canvas` starts an Extension
Development Host and opens Canvas automatically.
