import React from "react";
import { Chip } from "@mui/material";

export function CategoryChip({ category }: { category: string }) {
  const c = (category || "other").toLowerCase();
  const color =
    c === "snacks"
      ? "secondary"
      : c === "protein"
        ? "success"
        : c === "vegetables"
          ? "primary"
          : c === "fruits"
            ? "info"
            : "default";

  return (
    <Chip
      size="small"
      label={c}
      color={color as any}
      variant="outlined"
      sx={{ borderColor: "rgba(255,255,255,0.18)" }}
    />
  );
}

