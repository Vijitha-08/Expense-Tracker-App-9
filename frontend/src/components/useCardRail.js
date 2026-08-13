import { useEffect, useRef } from "react";

/**
 * Auto-advance for the mobile card rails (hero stats, "How It Works").
 *
 * Returns a ref to put on the EXISTING container element - it adds no
 * markup, no classes and no styles. All of the layout lives in the
 * `@media (max-width: 768px)` block at the bottom of App.css; this hook
 * only nudges `scrollLeft`.
 *
 * Three decisions worth knowing about:
 *
 * 1. It ping-pongs (first -> last -> first) rather than looping through
 *    a cloned set of cards. A true infinite loop needs duplicated DOM
 *    nodes and a silent `scrollLeft` jump when the seam is reached; that
 *    jump fights iOS momentum scrolling and shows up as a stutter, and
 *    it would mean touching the card markup. The reversal reads as
 *    continuous motion and costs nothing.
 *
 * 2. It stops for good on the first real user interaction. An auto-
 *    advancing row that keeps reclaiming control is the single most
 *    complained-about carousel behaviour, and moving content that cannot
 *    be stopped fails WCAG 2.2.2. The first swipe is a clear statement
 *    that the user is driving now.
 *
 * 3. It does nothing above the breakpoint, nothing under
 *    `prefers-reduced-motion`, and nothing while the tab is hidden.
 */
export default function useCardRail({
  interval = 3200,
  startDelay = 1600,
  breakpoint = 768,
} = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const rail = ref.current;
    if (!rail) return;

    const isMobile = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let timer = null;
    let delay = null;
    let index = 0;
    let direction = 1;
    let retired = false; // set once the user takes over - never unset

    const advance = () => {
      const cards = Array.from(rail.children);
      if (cards.length < 2) return;

      // Nothing to scroll: the cards already fit. Can happen after an
      // orientation change or if the breakpoint is straddled.
      if (rail.scrollWidth - rail.clientWidth < 2) return;

      index += direction;
      if (index > cards.length - 1) {
        index = cards.length - 2;
        direction = -1;
      } else if (index < 0) {
        index = 1;
        direction = 1;
      }

      const target = cards[index];
      // Measured rather than read from offsetLeft: offsetLeft is
      // relative to the offsetParent, which is not the rail, so it
      // silently includes the section's own padding.
      const padLeft = parseFloat(getComputedStyle(rail).paddingLeft) || 0;
      const shift =
        target.getBoundingClientRect().left -
        rail.getBoundingClientRect().left -
        padLeft;

      rail.scrollBy({ left: shift, behavior: "smooth" });
    };

    const stop = () => {
      clearTimeout(delay);
      clearInterval(timer);
      delay = null;
      timer = null;
    };

    const retire = () => {
      retired = true;
      stop();
    };

    const start = () => {
      if (retired || timer || delay) return;
      if (!isMobile.matches || reduced.matches) return;
      // A beat before the first move, so the row is readable on arrival
      // and the motion registers as "this scrolls" rather than a glitch.
      delay = setTimeout(() => {
        delay = null;
        timer = setInterval(advance, interval);
      }, startDelay);
    };

    // Anything that means "I am driving". `wheel` covers trackpads,
    // `keydown` covers arrow keys once the rail has focus.
    const handOver = ["pointerdown", "touchstart", "wheel", "keydown"];
    handOver.forEach((evt) =>
      rail.addEventListener(evt, retire, { passive: true })
    );

    // Re-evaluate when the viewport crosses the breakpoint or the user
    // flips the reduce-motion setting.
    const reassess = () => {
      stop();
      start();
    };
    isMobile.addEventListener("change", reassess);
    reduced.addEventListener("change", reassess);

    // Pause while the tab is in the background; a row that has silently
    // advanced eight cards is disorienting to come back to.
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    start();

    return () => {
      stop();
      handOver.forEach((evt) => rail.removeEventListener(evt, retire));
      isMobile.removeEventListener("change", reassess);
      reduced.removeEventListener("change", reassess);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [interval, startDelay, breakpoint]);

  return ref;
}
