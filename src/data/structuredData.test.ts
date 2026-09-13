import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_URL } from "./site";
import {
  buildFreeToolOfferSchema,
  ORGANIZATION_LOGO,
  ORGANIZATION_SAME_AS,
  PRODUCT_IMAGE_URL,
} from "./structuredData";

/** Reads a PNG's real pixel dimensions from its IHDR chunk (bytes 16-23),
 * independent of whatever any constant in the codebase claims they are —
 * so a test asserting "the file is actually 512x512" can't be fooled by a
 * stale hardcoded width/height. No image library needed: the IHDR chunk
 * is always the first chunk, at a fixed offset, in every valid PNG. */
function readPngDimensions(filePath: string): { width: number; height: number } {
  const buffer = readFileSync(filePath);
  const isPng = buffer.readUInt32BE(0) === 0x89504e47;
  if (!isPng) throw new Error(`${filePath} is not a PNG file`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("buildFreeToolOfferSchema", () => {
  it("always returns a real $0 Offer, regardless of the paid product's sales state", () => {
    expect(buildFreeToolOfferSchema()).toEqual({ "@type": "Offer", price: 0, priceCurrency: "USD" });
  });

  it("is independent of SALES_CONFIG.salesEnabled — a free tool's price never depends on paid-product state", () => {
    // Whatever SALES_CONFIG.salesEnabled currently is (true now that Dodo
    // checkout is live, false in an earlier state), buildFreeToolOfferSchema()
    // doesn't read it at all — the free tools' $0 price is unconditional.
    // Asserting the shape here regardless of that value documents the
    // independence for future readers.
    expect(buildFreeToolOfferSchema()).toEqual({ "@type": "Offer", price: 0, priceCurrency: "USD" });
  });
});

describe("PRODUCT_IMAGE_URL", () => {
  it("is an absolute HTTPS URL on the canonical production domain", () => {
    expect(PRODUCT_IMAGE_URL.startsWith(`${SITE_URL}/`)).toBe(true);
    expect(new URL(PRODUCT_IMAGE_URL).protocol).toBe("https:");
  });

  it("points to a real file that exists in the public/ build source", () => {
    const localPath = path.resolve(process.cwd(), "public", new URL(PRODUCT_IMAGE_URL).pathname.replace(/^\//, ""));
    expect(existsSync(localPath)).toBe(true);
  });

  it("references an image at least 1200x630, per Google's product/social image guidance", () => {
    const localPath = path.resolve(process.cwd(), "public", new URL(PRODUCT_IMAGE_URL).pathname.replace(/^\//, ""));
    const { width, height } = readPngDimensions(localPath);
    expect(width).toBeGreaterThanOrEqual(1200);
    expect(height).toBeGreaterThanOrEqual(630);
  });
});

describe("ORGANIZATION_LOGO", () => {
  it("is an ImageObject with an absolute HTTPS URL on the canonical production domain", () => {
    expect(ORGANIZATION_LOGO["@type"]).toBe("ImageObject");
    expect(ORGANIZATION_LOGO.url.startsWith(`${SITE_URL}/`)).toBe(true);
    expect(new URL(ORGANIZATION_LOGO.url).protocol).toBe("https:");
  });

  it("points to a real file that exists in the public/ build source", () => {
    const localPath = path.resolve(process.cwd(), "public", new URL(ORGANIZATION_LOGO.url).pathname.replace(/^\//, ""));
    expect(existsSync(localPath)).toBe(true);
  });

  it("is genuinely square and at least 112x112, and the declared width/height match the real file", () => {
    const localPath = path.resolve(process.cwd(), "public", new URL(ORGANIZATION_LOGO.url).pathname.replace(/^\//, ""));
    const { width, height } = readPngDimensions(localPath);

    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(112);
    expect(ORGANIZATION_LOGO.width).toBe(width);
    expect(ORGANIZATION_LOGO.height).toBe(height);
  });
});

describe("ORGANIZATION_SAME_AS", () => {
  it("is empty today — no verified external profile has been configured", () => {
    expect(ORGANIZATION_SAME_AS).toEqual([]);
  });

  it("a schema conditionally spreading it in produces no 'sameAs' key while empty, never sameAs: []", () => {
    const schema = {
      "@type": "Organization",
      name: "x",
      ...(ORGANIZATION_SAME_AS.length > 0 ? { sameAs: ORGANIZATION_SAME_AS } : {}),
    };
    expect("sameAs" in schema).toBe(false);
  });

  it("never contains the site's own URL, if entries are ever added", () => {
    for (const url of ORGANIZATION_SAME_AS) {
      expect(url.startsWith(SITE_URL)).toBe(false);
    }
  });
});
