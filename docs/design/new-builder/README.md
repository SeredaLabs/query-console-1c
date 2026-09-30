# Canvas / New Builder

Canvas is bundled with the extension and remains off by default. Enable
`queryConsole.enableNewBuilderPreview`, then run `1C: New Builder (Preview)`.
For development, F5 or `npm run preview:canvas` opens the Development Host.

The [current capability matrix](feature-baseline.md) defines the completed
functional baseline, explicit preserve-only capabilities and Preview boundary.
[Shared safety contracts](../../development/contracts/safety-and-preservation.md)
and [verification gates](../../development/testing-and-release.md#canvas-verification)
apply to both Classic and Canvas. Remaining work/status lives in the
[technical-debt ledger](../../development/technical-debt.md#canvas-ux-and-release-work);
[roadmap](../../development/roadmap.md) gives the order.

## Design references

This directory also holds any approved visual references named `structure.png`,
`fields.png`, `conditions.png`, `grouping.png`, `sorting.png`, `additional.png`,
`package.png`, and `union.png`. No placeholder screenshots are provided.
For presentation, approved screenshots guide visual design. For functionality,
repository/domain capabilities and the current matrix take precedence; a visual
reference cannot create a domain capability.

Original visual/graph specs, delivery notes and phase definitions are indexed in
[historical evidence](../../development/audits/README.md). Consult them for intent
and observations, not current status or a new authorization to implement features.
