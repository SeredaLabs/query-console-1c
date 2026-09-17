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

For contributor debugging, `F5` or `npm run preview:canvas` starts an Extension
Development Host and opens Canvas automatically.
