export interface NavigationWidthVariants {
  /** Natural width of the complete inline navigation. */
  inline: number;
  /** Natural width of the current/total pager navigation. */
  compact: number;
}

export interface PackageNavigationFit {
  /** Full PackageNav width, including its horizontal padding. */
  containerWidth: number;
  /** Combined left + right padding of PackageNav. */
  horizontalPadding: number;
  /** Gap between every direct PackageNav child. */
  gap: number;
  /** Natural widths of direct children other than Package and UNION. */
  fixedSiblingWidths: readonly number[];
  packageWidths: NavigationWidthVariants;
  unionWidths: NavigationWidthVariants;
}

export interface NavigationCompaction {
  compactPackage: boolean;
  compactUnion: boolean;
}

/**
 * Chooses Package/UNION presentation from measured DOM widths instead of
 * member-count limits. Package is the primary, outer navigation and therefore
 * gets first use of the available space. If its inline form does not fit even
 * beside compact UNION, Package compacts and UNION may use the released room.
 */
export function resolveNavigationCompaction({
  containerWidth,
  horizontalPadding,
  gap,
  fixedSiblingWidths,
  packageWidths,
  unionWidths,
}: PackageNavigationFit): NavigationCompaction {
  const groupCount = fixedSiblingWidths.length + 2;
  const gapsWidth = Math.max(0, groupCount - 1) * gap;
  const fixedWidth = fixedSiblingWidths.reduce((sum, width) => sum + width, 0) + gapsWidth;
  const availableWidth = Math.max(0, containerWidth - horizontalPadding);

  // Fractional CSS pixels can differ slightly between scrollWidth and
  // getBoundingClientRect(). A one-pixel tolerance prevents mode flicker.
  const fits = (packageWidth: number, unionWidth: number): boolean =>
    fixedWidth + packageWidth + unionWidth <= availableWidth + 1;

  const compactPackage = !fits(packageWidths.inline, unionWidths.compact);
  const chosenPackageWidth = compactPackage ? packageWidths.compact : packageWidths.inline;
  const compactUnion = !fits(chosenPackageWidth, unionWidths.inline);

  return { compactPackage, compactUnion };
}
