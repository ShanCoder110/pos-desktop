import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ token: "one" as string | null, version: 0 }));
vi.mock("@/services/api", () => ({ getDataVersion: () => auth.version }));
vi.mock("@/services/authToken", () => ({ getAccessToken: () => auth.token }));

import { cachedLocalRead } from "@/services/readCache";

describe("cachedLocalRead", () => {
  beforeEach(() => {
    auth.token = "one";
    auth.version += 1;
  });

  it("coalesces a pending read and reuses its completed result", async () => {
    const loader = vi.fn(async () => [1, 2]);
    const [first, second] = await Promise.all([
      cachedLocalRead("coalesce", loader),
      cachedLocalRead("coalesce", loader),
    ]);
    expect(first).toEqual([1, 2]);
    expect(second).toBe(first);
    expect(await cachedLocalRead("coalesce", loader)).toBe(first);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("invalidates after a write or sign-in change", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);
    expect(await cachedLocalRead("version", loader)).toBe(1);
    auth.version += 1;
    expect(await cachedLocalRead("version", loader)).toBe(2);
    auth.token = "two";
    expect(await cachedLocalRead("version", loader)).toBe(3);
  });

  it("lets one caller abort without cancelling another caller", async () => {
    let complete!: (value: number) => void;
    const loader = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          complete = resolve;
        }),
    );
    const controller = new AbortController();
    const abandoned = cachedLocalRead("abort", loader, controller.signal);
    const active = cachedLocalRead("abort", loader);
    controller.abort();
    await expect(abandoned).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    complete(7);
    await expect(active).resolves.toBe(7);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
