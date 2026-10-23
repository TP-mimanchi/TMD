/** Folder artwork supplied by the user; the front opens independently of the tab. */
export const folderIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" focusable="false" fill="#000">
  <path class="folder-front" d="M19,20H5c-1.7,0-3-1.3-3-3V5l4-1l5,1h8c1.7,0,3,1.3,3,3v9C22,18.7,20.7,20,19,20z" opacity=".35"></path>
  <path d="M11,5H2V4c0-1.1,0.9-2,2-2h4.6c0.9,0,1.6,0.6,1.9,1.4L11,5z"></path>
</svg>`;

export function folderIconState(tree: HTMLElement, path: string) {
  const row = Array.from(tree.querySelectorAll<HTMLElement>(".tree-item.dir"))
    .find((item) => item.dataset.path === path);
  const front = row?.querySelector<SVGPathElement>(".folder-front");
  if (!front) return null;
  return { front, style: getComputedStyle(front) };
}

export function animateFolderIcon(tree: HTMLElement, path: string, previous: { transform: string; opacity: string } | null) {
  if (!previous || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const current = folderIconState(tree, path);
  if (!current) return;
  // The tree replaces its rows on expansion. Animate explicitly from the old
  // painted state so both directions (and rapid reversals) survive that rebuild.
  current.front.animate([
    previous,
    { transform: current.style.transform, opacity: current.style.opacity },
  ], { duration: 220, easing: "cubic-bezier(0.2, 0.7, 0.25, 1)" });
}
