import { getFontEmbedCSS, toBlob } from "html-to-image";

/** Finish preparation before submitting anything, so a timeout cannot print later. */
export async function captureReceiptPages(node: HTMLElement, paper: string): Promise<Uint8Array[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new Error(
          "Receipt preparation took too long. Nothing was sent to the printer. Please try again.",
        ),
      );
    }, 20_000);
  });
  const prepare = async () => {
    await document.fonts.ready;
    await Promise.all(
      [...node.querySelectorAll("img")].map(async (image) => {
        if (image.decode) await image.decode();
        if (!image.complete || image.naturalWidth === 0) {
          throw new Error(
            "The receipt logo could not load. Check the saved logo in Invoice Settings.",
          );
        }
      }),
    );
    controller.signal.throwIfAborted();
    // Reuse embedded fonts across split pages instead of reading/embedding the
    // large Urdu font for every page. Keep it embedded for WebView raster output.
    const options = { cacheBust: false, fetchRequestInit: { signal: controller.signal } };
    const fontEmbedCSS = await getFontEmbedCSS(node, options);
    const pages = [...node.querySelectorAll<HTMLElement>(".slip-page")];
    if (!pages.length) throw new Error("Receipt has no pages to print.");
    const images: Uint8Array[] = [];
    for (const page of pages) {
      controller.signal.throwIfAborted();
      const width = Math.ceil(Math.max(page.clientWidth, page.scrollWidth));
      const height = Math.ceil(Math.max(page.clientHeight, page.scrollHeight));
      const dots = paper === "MM_58" ? 384 : 576;
      const blob = await toBlob(page, {
        ...options,
        fontEmbedCSS,
        width,
        height,
        pixelRatio: Math.min(2, Math.max(1, dots / width)),
        backgroundColor: "#ffffff",
        style: { boxShadow: "none", overflow: "visible" },
      });
      if (!blob) throw new Error("Could not capture the receipt. Nothing was sent to the printer.");
      images.push(new Uint8Array(await blob.arrayBuffer()));
    }
    controller.signal.throwIfAborted();
    return images;
  };
  try {
    return await Promise.race([prepare(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
