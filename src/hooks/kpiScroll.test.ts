import { describe, expect, it } from "vitest";
import {
  advanceKpiScroll,
  crossedArmedKpiBoundary,
  initialKpiScroll,
  shouldArmKpiBoundary,
} from "./kpiScroll";

describe("shared KPI scroll gestures", () => {
  it("arms a native boundary only after an upward gesture reaches the top", () => {
    const hidden = advanceKpiScroll(initialKpiScroll, 100, 0);
    expect(shouldArmKpiBoundary(hidden, 0, 500)).toBe(false);
    const up = advanceKpiScroll(hidden, -100, 100);
    expect(shouldArmKpiBoundary(up, 0, 500)).toBe(true);
    expect(shouldArmKpiBoundary(up, 50, 500)).toBe(false);
    expect(shouldArmKpiBoundary(up, 0, 0)).toBe(false);
  });
  it("reveals from native scrolling alone, with no wheel or mousemove event", () => {
    expect(crossedArmedKpiBoundary(false, 0)).toBe(false);
    expect(crossedArmedKpiBoundary(true, 1)).toBe(false);
    expect(crossedArmedKpiBoundary(true, 0)).toBe(true);
  });
  it("hides on the first downward gesture", () => {
    expect(advanceKpiScroll(initialKpiScroll, 100, 0).hidden).toBe(true);
  });
  it("requires two upward gestures, not two events from one swipe", () => {
    let state = advanceKpiScroll(initialKpiScroll, 100, 0);
    state = advanceKpiScroll(state, -30, 40);
    state = advanceKpiScroll(state, -20, 60);
    state = advanceKpiScroll(state, -10, 100);
    expect(state.hidden).toBe(true);
    expect(state.upGestures).toBe(1);
    expect(advanceKpiScroll(state, -30, 400, true).hidden).toBe(false);
  });
  it("resets upward progress when scrolling down again", () => {
    let state = advanceKpiScroll(initialKpiScroll, 100, 0);
    state = advanceKpiScroll(state, -30, 300);
    state = advanceKpiScroll(state, 30, 600);
    state = advanceKpiScroll(state, -30, 900);
    expect(state.hidden).toBe(true);
    expect(state.upGestures).toBe(1);
  });
  it("ignores tiny jitter and keeps the cards visible while scrolling up", () => {
    expect(advanceKpiScroll(initialKpiScroll, 1, 0)).toBe(initialKpiScroll);
    expect(advanceKpiScroll(initialKpiScroll, -100, 0).hidden).toBe(false);
  });
  it("keeps the first upward gesture across a long pause or pointer movement", () => {
    let state = advanceKpiScroll(initialKpiScroll, 100, 0);
    state = advanceKpiScroll(state, -30, 500);
    expect(state.hidden).toBe(true);
    expect(advanceKpiScroll(state, -30, 30_000, true).hidden).toBe(false);
  });
  it("keeps cards hidden on arrival and reveals on a fresh upward gesture at the top", () => {
    let state = advanceKpiScroll(initialKpiScroll, 100, 0);
    state = advanceKpiScroll(state, -30, 500);
    state = advanceKpiScroll(state, -20, 550);
    expect(state.hidden).toBe(true);
    expect(advanceKpiScroll(state, -30, 900, true).hidden).toBe(false);
  });
  it("never reveals on two upward gestures while still below the top", () => {
    let state = advanceKpiScroll(initialKpiScroll, 100, 0);
    state = advanceKpiScroll(state, -30, 500);
    state = advanceKpiScroll(state, -30, 1000);
    expect(state.hidden).toBe(true);
  });
  it("also requires two gestures when a short list is already at the top", () => {
    let state = advanceKpiScroll(initialKpiScroll, 100, 0);
    state = advanceKpiScroll(state, -30, 500, true);
    expect(state.hidden).toBe(true);
    expect(advanceKpiScroll(state, -30, 1000, true).hidden).toBe(false);
  });
  it("accepts two quick gestures without the old 220ms delay", () => {
    let state = advanceKpiScroll(initialKpiScroll, 100, 0);
    state = advanceKpiScroll(state, -30, 100, true);
    expect(state.hidden).toBe(true);
    expect(advanceKpiScroll(state, -30, 170, true).hidden).toBe(false);
  });
  it("accepts a quick separate upward gesture after arriving at the top", () => {
    let state = advanceKpiScroll(initialKpiScroll, 100, 0);
    state = advanceKpiScroll(state, -300, 100);
    expect(state.hidden).toBe(true);
    expect(advanceKpiScroll(state, -30, 170, true).hidden).toBe(false);
  });
  it("accepts a small quick trackpad input at the top", () => {
    let state = advanceKpiScroll(initialKpiScroll, 100, 0);
    state = advanceKpiScroll(state, -300, 100);
    expect(advanceKpiScroll(state, -0.5, 170, true).hidden).toBe(false);
  });
  it("ignores all momentum from the swipe that reaches the top", () => {
    let state = advanceKpiScroll(initialKpiScroll, 100, 0);
    state = advanceKpiScroll(state, -300, 100);
    for (const [time, delta] of [
      [116, -60],
      [132, -30],
      [148, -12],
      [164, -2],
      [180, -0.5],
    ]) {
      state = advanceKpiScroll(state, delta, time, true);
      expect(state.hidden).toBe(true);
    }
    expect(advanceKpiScroll(state, -30, 250, true).hidden).toBe(false);
  });
});
