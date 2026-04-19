import React from "react";
import { Box, Paper, SxProps, Theme, Typography } from "@mui/material";

export const glassPanelSx: SxProps<Theme> = {
  borderRadius: 5,
  background: "linear-gradient(135deg, rgba(9,19,36,0.82), rgba(11,35,58,0.72))",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(16px)",
  boxShadow: "0 22px 70px rgba(0,0,0,0.22)",
  overflow: "hidden",
  position: "relative",
  transition: "transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease",
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 28px 90px rgba(0,0,0,0.28)',
    borderColor: 'rgba(124,255,178,0.14)',
  },
};

export const innerCardSx: SxProps<Theme> = {
  borderRadius: 4,
  background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  transition: "transform 180ms ease, border-color 180ms ease, background 180ms ease",
  '&:hover': {
    transform: 'translateY(-1px)',
    borderColor: 'rgba(76,174,255,0.18)',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
  },
};

export function GlassPanel({ children, sx }: { children: React.ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Paper sx={{ ...glassPanelSx, ...((sx || {}) as object) }}>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          '&::before': {
            content: '""',
            position: 'absolute',
            width: 180,
            height: 180,
            borderRadius: '50%',
            right: -24,
            top: -72,
            background: 'radial-gradient(circle, rgba(76,174,255,0.14), rgba(76,174,255,0))',
            animation: 'csPanelFloat 12s ease-in-out infinite',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            width: 160,
            height: 160,
            borderRadius: '50%',
            left: -32,
            bottom: -70,
            background: 'radial-gradient(circle, rgba(124,255,178,0.12), rgba(124,255,178,0))',
            animation: 'csPanelFloat 14s ease-in-out infinite reverse',
          },
          '@keyframes csPanelFloat': {
            '0%': { transform: 'translate3d(0,0,0) scale(1)' },
            '50%': { transform: 'translate3d(10px,18px,0) scale(1.06)' },
            '100%': { transform: 'translate3d(0,0,0) scale(1)' },
          },
        }}
      />
      <Box sx={{ position: 'relative', zIndex: 1 }}>{children}</Box>
    </Paper>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
      <Box>
        {eyebrow ? (
          <Typography variant="overline" sx={{ letterSpacing: 1.8, color: 'rgba(255,255,255,0.62)', fontWeight: 800 }}>
            {eyebrow}
          </Typography>
        ) : null}
        <Typography variant="h6" sx={{ fontWeight: 1000 }}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography sx={{ fontSize: 12, mt: 0.5, color: 'rgba(255,255,255,0.68)', maxWidth: 760 }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {action ? <Box>{action}</Box> : null}
    </Box>
  );
}

export function MetricBadge({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Paper sx={{ ...innerCardSx, px: 1.5, py: 1, borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.58)', textTransform: 'uppercase', letterSpacing: 1.2 }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 900 }}>{value}</Typography>
    </Paper>
  );
}
