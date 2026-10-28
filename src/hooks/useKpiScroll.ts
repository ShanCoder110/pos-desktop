import { useEffect, useRef, useState, type RefObject } from "react";
import {
  advanceKpiScroll,
  crossedArmedKpiBoundary,
  initialKpiScroll,
  shouldArmKpiBoundary,
} from "./kpiScroll";

export function useKpiScroll(root: RefObject<HTMLDivElement | null>, section: string) {
  const [hidden, setHidden] = useState(false);
  const state = useRef(initialKpiScroll);

  useEffect(() => {
    const hub = root.current?.closest<HTMLElement>(".mgmt-main") ?? root.current?.parentElement;
    if (!hub) return;
    state.current = initialKpiScroll;
    setHidden(false);
    let lastWheelAt = -Infinity;
    let ignoreLayoutScrollUntil = 0;
    const positions = new WeakMap<Element, number>();
    let activeScroller: HTMLElement | null = null;
    let touchY: number | null = null;
    let touchCounted = false;
    let armedScroller: HTMLElement | null = null;
    let scrollIdleTimer: ReturnType<typeof setTimeout> | undefined;
    const nativeScrollEnd = "onscrollend" in hub;

    function isScrollable(element: HTMLElement) {
      return /auto|scroll/.test(getComputedStyle(element).overflowY);
    }

    function scrollerFor(target: Element) {
      // Header gestures continue controlling the last active table/page.
      for (let node: Element | null = target; node && node !== hub; node = node.parentElement) {
        if (node instanceof HTMLElement && isScrollable(node)) return node;
      }
      if (activeScroller?.isConnected) return activeScroller;
      return (
        hub?.querySelector<HTMLElement>(".ui-table-wrap") ??
        hub?.querySelector<HTMLElement>(".mgmt-body > *") ??
        null
      );
    }

    function advance(delta: number, atTop = false, freshGesture = false) {
      const now = performance.now();
      const next = advanceKpiScroll(
        freshGesture ? { ...state.current, lastAt: -Infinity } : state.current,
        delta,
        now,
        atTop,
      );
      if (next.hidden !== state.current.hidden) {
        if (!next.hidden) armedScroller = null;
        // Resizing the table can clamp scrollTop; that is not another gesture.
        ignoreLayoutScrollUntil = now + 400;
        setHidden(next.hidden);
      }
      state.current = next;
    }

    function armBoundary(table: HTMLElement) {
      if (
        armedScroller === table ||
        !shouldArmKpiBoundary(
          state.current,
          table.scrollTop,
          table.scrollHeight - table.clientHeight,
        )
      )
        return;
      // One invisible pixel keeps the same native scroll target alive. The
      // next trackpad gesture produces an actual scroll, even if the browser
      // stops delivering wheel events at an exhausted overflow boundary.
      armedScroller = table;
      state.current = {
        ...state.current,
        upGestures: Math.max(1, state.current.upGestures),
        direction: -1,
      };
      positions.set(table, 1);
      table.scrollTop = 1;
    }

    function waitForScrollEnd(table: HTMLElement) {
      if (nativeScrollEnd) return;
      clearTimeout(scrollIdleTimer);
      scrollIdleTimer = setTimeout(() => armBoundary(table), 120);
    }

    function onScrollEnd(event: Event) {
      if (event.target instanceof HTMLElement && isScrollable(event.target))
        armBoundary(event.target);
    }

    function onWheel(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) return;
      if (!(event.target instanceof Element)) return;
      if (document.querySelector(".ui-drawer, .ui-modal")) return;
      // The pointer can move onto the toolbar/header after the row collapses.
      // Keep those page-level gestures, but don't hijack scrolling in pickers.
      if (
        event.target.closest(
          'aside, [role="listbox"], .ui-pop-list, .ui-combo-menu, .ui-pop-panel, .ui-popover, textarea',
        )
      )
        return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const table = scrollerFor(event.target);
      if (!table) return;
      activeScroller = table;
      lastWheelAt = performance.now();
      if (armedScroller === table && event.deltaY < 0) {
        advance(event.deltaY, true, true);
      } else {
        if (event.deltaY > 0) armedScroller = null;
        // Wheel timing alone cannot tell a trackpad's second swipe from its
        // momentum. Completion arms the native boundary; only that can reveal.
        advance(event.deltaY, false);
      }
      waitForScrollEnd(table);
    }

    function onScroll(event: Event) {
      const table = event.target;
      if (
        !(table instanceof HTMLElement) ||
        !isScrollable(table) ||
        table.closest('[role="listbox"], .ui-pop-list, .ui-combo-menu, .ui-popover, textarea')
      )
        return;
      activeScroller = table;
      const before = positions.get(table) ?? 0;
      positions.set(table, table.scrollTop);
      if (crossedArmedKpiBoundary(armedScroller === table, table.scrollTop)) {
        advance(-40, true, true);
        return;
      }
      if (armedScroller === table && table.scrollTop <= 1) return;
      if (table.scrollTop > 1) armedScroller = null;
      waitForScrollEnd(table);
      const now = performance.now();
      if (now - lastWheelAt < 300 || now < ignoreLayoutScrollUntil) return;
      // Touch, scrollbar dragging and keyboard scrolling use the same rule.
      advance(table.scrollTop - before);
    }

    function onTouchStart(event: TouchEvent) {
      touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
      touchCounted = false;
    }

    function onTouchMove(event: TouchEvent) {
      if (touchY === null || event.touches.length !== 1 || !(event.target instanceof Element))
        return;
      if (
        event.target.closest(
          '[role="listbox"], .ui-pop-list, .ui-combo-menu, .ui-popover, textarea',
        )
      )
        return;
      lastWheelAt = performance.now();
      const delta = touchY - event.touches[0].clientY;
      if (touchCounted || Math.abs(delta) < 8) return;
      const table = scrollerFor(event.target);
      if (!table) return;
      activeScroller = table;
      touchCounted = true;
      advance(delta, table.scrollTop <= 1, true);
    }

    function onPageKey(event: KeyboardEvent) {
      if (
        event.repeat ||
        !["PageUp", "PageDown", "Home", "End"].includes(event.key) ||
        !(event.target instanceof Element)
      )
        return;
      if (event.target.closest('input, textarea, select, [role="combobox"], [role="listbox"]'))
        return;
      const table = scrollerFor(event.target);
      if (!table) return;
      activeScroller = table;
      lastWheelAt = performance.now();
      advance(
        event.key === "PageUp" || event.key === "Home" ? -40 : 40,
        table.scrollTop <= 1,
        true,
      );
    }

    window.addEventListener("wheel", onWheel, { passive: true, capture: true });
    hub.addEventListener("scroll", onScroll, true);
    hub.addEventListener("scrollend", onScrollEnd, true);
    hub.addEventListener("touchstart", onTouchStart, { passive: true });
    hub.addEventListener("touchmove", onTouchMove, { passive: true });
    hub.addEventListener("keydown", onPageKey);
    return () => {
      window.removeEventListener("wheel", onWheel, true);
      hub.removeEventListener("scroll", onScroll, true);
      hub.removeEventListener("scrollend", onScrollEnd, true);
      clearTimeout(scrollIdleTimer);
      hub.removeEventListener("touchstart", onTouchStart);
      hub.removeEventListener("touchmove", onTouchMove);
      hub.removeEventListener("keydown", onPageKey);
    };
  }, [root, section]);

  return hidden;
}
