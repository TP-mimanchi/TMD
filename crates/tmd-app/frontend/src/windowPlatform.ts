/** Tauri builds use the target, including cross builds; plain Vite uses the host. */
export function usesNativeMacWindowControls(targetPlatform: string | undefined, navigatorPlatform: string) {
  if (targetPlatform) return targetPlatform === "darwin" || targetPlatform === "macos";
  return navigatorPlatform.startsWith("Mac");
}
