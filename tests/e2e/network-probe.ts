import type { net as ElectronNet } from "electron";
// Self-contained so Playwright can serialize this exact function into the real main process.
export async function probeNetwork(
  { net }: { net: Pick<typeof ElectronNet, "fetch"> },
  url = "https://example.com",
): Promise<boolean> {
  try {
    const nonce = `${Date.now()}-${Math.random()}`;
    const response = await net.fetch(
      url + (url.includes("?") ? "&" : "?") + "st_probe=" + nonce,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    await response.body?.cancel();
    return true;
  } catch {
    return false;
  }
}
