import type { NextConfig } from "next";
import path from "node:path";

// Static export: собирается в out/ как чистые HTML/CSS/JS — деплой на тот же
// Caddy file_server и на Vercel без Node-рантайма (как текущий webapp/).
// turbopack.root поднят на уровень репозитория, чтобы фронтенд мог импортировать
// общие модули из ../webapp (словарь, иконки, токены) без дублирования.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  turbopack: {
    root: path.resolve(process.cwd(), ".."),
  },
};

export default nextConfig;
