import { describe, expect, it } from 'vitest';
import { resolveNavigationCompaction } from '../../src/webview-canvas/components/packageNavLayout';

describe('Canvas PackageNav measured fit', () => {
  const wideNavigation = {
    horizontalPadding: 20,
    gap: 6,
    // Package label, two dividers and query identity.
    fixedSiblingWidths: [70, 1, 220, 1],
    packageWidths: { inline: 270, compact: 80 }, // 11 package members.
    unionWidths: { inline: 500, compact: 180 }, // 5+ SELECT members.
  } as const;

  it('keeps both Package and UNION expanded when the wide window has room', () => {
    expect(resolveNavigationCompaction({
      ...wideNavigation,
      containerWidth: 1940,
    })).toEqual({ compactPackage: false, compactUnion: false });
  });

  it('compacts UNION when only the primary Package navigation fits inline', () => {
    expect(resolveNavigationCompaction({
      ...wideNavigation,
      containerWidth: 850,
    })).toEqual({ compactPackage: false, compactUnion: true });
  });

  it('lets UNION expand when a large Package navigation must compact', () => {
    expect(resolveNavigationCompaction({
      ...wideNavigation,
      containerWidth: 900,
      packageWidths: { inline: 700, compact: 80 },
      unionWidths: { inline: 300, compact: 150 },
    })).toEqual({ compactPackage: true, compactUnion: false });
  });

  it('compacts both navigations when neither inline form fits', () => {
    expect(resolveNavigationCompaction({
      ...wideNavigation,
      containerWidth: 500,
    })).toEqual({ compactPackage: true, compactUnion: true });
  });

  it('uses the measured fit boundary instead of member-count limits', () => {
    const boundary = {
      horizontalPadding: 20,
      gap: 6,
      fixedSiblingWidths: [100, 200],
      packageWidths: { inline: 200, compact: 80 },
      unionWidths: { inline: 100, compact: 60 },
    } as const;

    expect(resolveNavigationCompaction({ ...boundary, containerWidth: 638 }))
      .toEqual({ compactPackage: false, compactUnion: false });
    expect(resolveNavigationCompaction({ ...boundary, containerWidth: 636 }))
      .toEqual({ compactPackage: false, compactUnion: true });
  });
});
