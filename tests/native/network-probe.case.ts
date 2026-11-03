import assert from "node:assert/strict";
import { createServer } from "node:http";
import { net } from "electron";
import { randomUUID } from "node:crypto";
import { probeNetwork } from "../e2e/network-probe";
import type { NativeCase } from "./helpers";
export const cases: NativeCase[] = [
  {
    name: "offline probe bypasses a previously cached Chromium response",
    async run(ctx) {
      const server = createServer((_req, res) => {
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.end("cacheable response");
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const address = server.address();
      if (!address || typeof address === "string") throw Error("No test port");
      const url = `http://127.0.0.1:${address.port}/${randomUUID()}`;
      ctx.defer(() => {
        if (server.listening) {
          server.closeAllConnections();
          server.close();
        }
      });
      const warm = await net.fetch(url);
      await warm.arrayBuffer();
      assert.equal(await probeNetwork({ net }, url), true);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      assert.equal(await probeNetwork({ net }, url), false);
    },
  },
];
