import { useEffect, useRef } from "react";

/**
 * Auto-advance for the mobile card rails (hero stats, "How It Works",
 * Features, About).
 *
 * Returns a ref to put on the EXISTING container element - it adds no
 * markup, no classes and no styles. All of the layout lives in the
 * `@media (max-width: 768px)` blocks at the bottom of App.css; this hook
 * only nudges `scrollLeft`.
 *
 * Three decisions worth knowing about:
 *
 * 1. It ping-pongs (first -> last -> first) rather than looping through
 *    a cloned set of cards. A true infinite loop needs duplicated DOM
 *    nodes and a silent `scrollLeft` jump at the seam; that jump fights
 *    iOS momentum scrolling and shows up as a stutter, and it would mean
 *    touching the card markup. The reversal reads as continuous motion
 *    and costs nothing.
 *
 * 2. It hands control over for good once the user scrolls the rail
 *    themselves. An auto-advancing row that keeps reclaiming control is
 *    the most complained-about carousel behaviour there is, and moving
 *    content that cannot be stopped fails WCAG 2.2.2.
 *
 *    HOW that is detected matters, and the first version of this file got
 *    it wrong. It listened for `wheel` and retired on any wheel event.
 *    On a laptop, scrolling the PAGE with a trackpad while the cursor
 *    happens to sit over a rail fires `wheel` on the rail - so the
 *    auto-slide died on first page scroll and looked broken. Listening
 *    for `touchstart` has the same flaw on a phone: a finger landing on
 *    the rail to scroll the page vertically is not an instruction to the
 *    rail.
 *
 *    So instead of guessing from input events, this compares the rail's
 *    actual `scrollLeft` against the value we last asked for. Only a real
 *    change on the HORIZONTAL axis counts, which is true of a swipe, a
 *    sideways trackpad gesture and an arrow key alike, and is never true
 *    of vertical page scrolling. Ground truth rather than inference.
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
    let settle = null;
    let index = 0;
    let direction = 1;
    let retired = false;   // set once the user takes over - never unset

    // Where we last told the rail to scroll to. Compared against the real
    // scrollLeft to tell our own movement apart from the user's.
    let expected = rail.scrollLeft;
    // True while our own smooth scroll is animating, when scrollLeft is
    // passing through intermediate values that are not user input.
    let selfScrolling = false;

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
      // Measured rather than read from offsetLeft: offsetLeft is relative
      // to the offsetParent, which is not the rail, so it silently
      // includes the section's own padding.
      const padLeft = parseFloat(getComputedStyle(rail).paddingLeft) || 0;
      const shift =
        target.getBoundingClientRect().left -
        rail.getBoundingClientRect().left -
        padLeft;

      selfScrolling = true;
      rail.scrollBy({ left: shift, behavior: "smooth" });

      // Smooth scrolling takes roughly 300-500ms; 700ms clears it with
      // room to spare, and the interval is far longer so these never
      // overlap. Re-reading scrollLeft at the end rather than trusting
      // the target matters: the browser clamps at the ends of the rail
      // and scroll-snap may adjust the final resting position.
      clearTimeout(settle);
      settle = setTimeout(() => {
        selfScrolling = false;
        expected = rail.scrollLeft;
      }, 700);
    };

    // The only thing that retires the auto-slide: the rail's horizontal
    // position changed and it was not us. 4px of slack absorbs sub-pixel
    // rounding and snap jitter.
    const onScroll = () => {
      if (retired || selfScrolling) return;
      if (Math.abs(rail.scrollLeft - expected) > 4) retire();
    };

    const stop = () => {
      clearTimeout(delay);
      clearTimeout(settle);
      clearInterval(timer);
      delay = null;
      timer = null;
      settle = null;
      selfScrolling = false;
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
        expected = rail.scrollLeft;
        timer = setInterval(advance, interval);
      }, startDelay);
    };

    rail.addEventListener("scroll", onScroll, { passive: true });

    // Re-evaluate when the viewport crosses the breakpoint or the user
    // flips the reduce-motion setting. Resyncing `expected` is required:
    // a resize can change scrollLeft on its own, which would otherwise
    // look like the user grabbing the rail.
    const reassess = () => {
      stop();
      expected = rail.scrollLeft;
      start();
    };
    isMobile.addEventListener("change", reassess);
    reduced.addEventListener("change", reassess);
    window.addEventListener("resize", reassess);

    // Pause while the tab is in the background; a row that has silently
    // advanced eight cards is disorienting to come back to.
    const onVisibility = () => {
      if (document.hidden) stop();
      else { expected = rail.scrollLeft; start(); }
    };
    document.addEventListener("visibilitychange", onVisibility);

    start();

    return () => {
      stop();
      rail.removeEventListener("scroll", onScroll);
      isMobile.removeEventListener("change", reassess);
      reduced.removeEventListener("change", reassess);
      window.removeEventListener("resize", reassess);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [interval, startDelay, breakpoint]);

  return ref;
}
