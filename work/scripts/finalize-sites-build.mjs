#!/usr/bin/env node

import { copyFile, mkdir } from "node:fs/promises";

const workerSource = new URL("../dist/ai_weekly_brief/index.js", import.meta.url);
const serverDirectory = new URL("../dist/server/", import.meta.url);
const serverEntry = new URL("../dist/server/index.js", import.meta.url);

await mkdir(serverDirectory, { recursive: true });
await copyFile(workerSource, serverEntry);
