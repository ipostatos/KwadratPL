import type { CSSProperties } from "react";
import Icons from "@shared/icons.js";

// Обёртка над общей картой SVG-путей (../webapp/icons.js). Тот же набор иконок
// Lucide, что и в webapp, без CDN и без дублирования путей.
export default function Icon({
  name,
  className,
  style,
}: {
  name: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: Icons.svg(name) }}
    />
  );
}
