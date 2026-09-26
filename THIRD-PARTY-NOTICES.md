# Third-party notices

This project includes third-party code and assets distributed under their
respective licenses.

## query_console_vscode

Portions of this project are derived from `query_console_vscode`.

- Source: https://github.com/AlekseyUAM/query_console_vscode (imported at
  v0.1.1 as the first commit of this repository)
- License: MIT License, Copyright (c) 2026 Aleksey Yudanov.
- Derived portions include, in modified form, the SDBL lexer, parser, generator
  and expression formatter (`src/core/query/`), the metadata loader
  (`src/core/metadata/`), the CLI tools (`src/cli/`) and the classic
  constructor webview (`src/webview/`).
- Modifications and new code: Copyright (c) 2026 SeredaLabs.

The full MIT copyright and permission notice covering this code is in
[LICENSE](LICENSE), which lists both copyright holders.

## @vscode/codicons

Toolbar icons and tree chevrons come from `@vscode/codicons`.

- Source: https://github.com/microsoft/vscode-codicons
- Icons: Creative Commons Attribution 4.0 International (CC-BY-4.0),
  © Microsoft Corporation.
- Code: MIT License, © Microsoft Corporation.

```text
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Metadata-kind icons

The icon outlines for metadata kinds (Catalog, Document, Registers, Plans, and
others; see `src/webview/components/metadataKindIcons.ts`) were adapted from the
`zerobig/vscode-1c-metadata-viewer` VS Code extension.

- Source: https://github.com/zerobig/vscode-1c-metadata-viewer
- License: MIT License, Copyright © 2015 Ilya Bushin.
- Modification: the fill color uses `currentColor` instead of separate fixed
  colors for dark and light themes, so the icons follow the editor theme.

```
The MIT License (MIT)

Copyright © 2015 Ilya Bushin

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
```
