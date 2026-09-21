import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Turtle } from "lucide-react";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const svg = renderToStaticMarkup(
  React.createElement(
    "svg",
    { xmlns: "http://www.w3.org/2000/svg", width: 32, height: 32, viewBox: "0 0 32 32" },
    React.createElement(Turtle, {
      x: 4,
      y: 1,
      width: 24,
      height: 24,
      viewBox: "0 0 24 24",
      fill: "none",
      color: "#66d9e8",
      strokeWidth: 2.25,
      strokeLinecap: "square",
      strokeLinejoin: "miter",
    }),
    React.createElement("path", {
      d: "M4 28H28",
      fill: "none",
      stroke: "#8b95a5",
      strokeWidth: 1.5,
      strokeLinecap: "square",
    }),
    React.createElement("circle", {
      cx: 19,
      cy: 28,
      r: 2.5,
      fill: "none",
      stroke: "#8b95a5",
      strokeWidth: 1.5,
    }),
  ),
);

const source = Buffer.from(svg);
const pixelBase = await sharp(source, { density: 96 })
  .resize(32, 32, { fit: "contain" })
  .png()
  .toBuffer();

async function pixelPng(size, destination) {
  await sharp(pixelBase)
    .resize(size, size, { kernel: sharp.kernel.nearest })
    .ensureAlpha()
    .png({ palette: false })
    .toFile(destination);
}

await mkdir("public/brand", { recursive: true });
await pixelPng(96, "public/brand/squitle-pixel.png");
await writeFile("public/brand/squitle-icon-source.svg", `${svg}\n`);
