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

Current checkpoint: [Canvas Feature Baseline Complete](feature-baseline.md),
verified 2026-09-30. Phase 13 source-subquery creation/recursive drill-down and
manual temporary descriptions are implemented, with contextual VT/TOTALS/INDEX
editing and the existing six workspaces/package/UNION navigation. The
[before/after capability matrix](feature-baseline.md#capability-matrix-before--after)
records advanced preserve-only boundaries and safely rejected C17/C18 inputs.
[Verification](../../development/testing-and-release.md#canvas-verification)
includes full browser gates and real VS Code nested edit/back/Save insertion.
Preview remains intentional pending separate UX/release hardening.

For contributor debugging, `F5` or `npm run preview:canvas` starts an Extension
Development Host and opens Canvas automatically.
