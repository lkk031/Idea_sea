// Keep the sea's layout viewport stable while the software keyboard covers it.
// Only the composer follows the visible viewport; physics continues underneath.
export function mountMobileViewport(): () => void {
  const root = document.documentElement;
  const mobile = window.matchMedia("(max-width: 719px) and (pointer: coarse)");
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom)";
  document.body.appendChild(probe);
  let width = window.innerWidth;
  let height = window.innerHeight;
  let locked = false;
  const nativeKeyboardHeight = () =>
    (window as Window & { __ideaSeaKeyboardHeight?: number }).__ideaSeaKeyboardHeight ?? 0;

  const editing = () => document.activeElement?.matches("input, textarea, [contenteditable=true]") ?? false;
  const clear = () => {
    for (const name of ["--sea-height", "--sea-safe-bottom", "--keyboard-offset", "--composer-safe-bottom"]) root.style.removeProperty(name);
    delete root.dataset.keyboardOpen;
  };
  const sync = () => {
    if (!mobile.matches) { locked = false; clear(); return; }
    if (window.innerWidth !== width) {
      // Rotation/split-screen is a real world resize, not keyboard occlusion.
      width = window.innerWidth;
      locked = false;
      if (editing()) (document.activeElement as HTMLElement).blur();
    }
    const viewport = window.visualViewport;
    const viewportBottom = viewport && viewport.scale === 1
      ? Math.min(window.innerHeight, viewport.height + viewport.offsetTop)
      : window.innerHeight;
    const nativeHeight = nativeKeyboardHeight();
    const visibleBottom = Math.min(viewportBottom, window.innerHeight - nativeHeight);
    if (locked && !editing() && visibleBottom >= height - 1) locked = false;
    if (!locked) {
      height = window.innerHeight;
      root.style.setProperty("--sea-safe-bottom", getComputedStyle(probe).paddingBottom);
    }
    root.style.setProperty("--sea-height", `${height}px`);
    const offset = Math.max(0, height - visibleBottom);
    root.style.setProperty("--keyboard-offset", `${offset}px`);
    if (nativeHeight > 0) root.style.setProperty("--composer-safe-bottom", "0px");
    else root.style.removeProperty("--composer-safe-bottom");
    if (offset > 1) root.dataset.keyboardOpen = "true";
    else delete root.dataset.keyboardOpen;
  };
  const focus = () => {
    if (mobile.matches && editing()) locked = true;
    sync();
  };
  sync();
  window.addEventListener("resize", sync);
  window.addEventListener("idea-sea-keyboard", sync);
  window.visualViewport?.addEventListener("resize", sync);
  window.visualViewport?.addEventListener("scroll", sync);
  document.addEventListener("focusin", focus);
  document.addEventListener("focusout", sync);
  mobile.addEventListener("change", sync);
  return () => {
    window.removeEventListener("resize", sync);
    window.removeEventListener("idea-sea-keyboard", sync);
    window.visualViewport?.removeEventListener("resize", sync);
    window.visualViewport?.removeEventListener("scroll", sync);
    document.removeEventListener("focusin", focus);
    document.removeEventListener("focusout", sync);
    mobile.removeEventListener("change", sync);
    probe.remove();
    clear();
  };
}
