import React from "react";
import { Chip } from "@mui/material";

function labelFor(category: string) {
  const key = (category || "other").toLowerCase();
  return key === "nuts_dry_fruits" ? "nuts / dry fruits" : key;
}

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
            : c === "nuts_dry_fruits"
              ? "warning"
              : c === "dairy"
                ? "info"
                : "default";

  return (
    <Chip
      size="small"
      label={labelFor(c)}
      color={color as any}
      variant="outlined"
      sx={{ borderColor: "rgba(255,255,255,0.18)" }}
    />
  );
}
