import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import {fileURLToPath} from "node:url";

const desktopDir=path.dirname(fileURLToPath(import.meta.url));
const projectDir=path.resolve(desktopDir,"..");

export default defineConfig({
  root:desktopDir,
  base:"./",
  publicDir:path.resolve(projectDir,"public"),
  plugins:[react()],
  resolve:{alias:{"@":projectDir}},
  css:{postcss:projectDir},
  build:{outDir:path.resolve(desktopDir,"dist-ui"),emptyOutDir:true},
});
