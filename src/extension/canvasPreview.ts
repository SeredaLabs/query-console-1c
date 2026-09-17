/** Development-only switch for opening the Canvas preview in an Extension Host. */
export function isCanvasPreviewEnabled(
  isDevelopmentHost: boolean,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return isDevelopmentHost && environment.QUERY_CONSOLE_CANVAS_PREVIEW === '1';
}
