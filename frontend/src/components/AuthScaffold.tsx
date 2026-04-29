import React from "react";
import { Box, Paper, Stack, SxProps, Theme, Typography } from "@mui/material";
import { GlassPanel, MetricBadge, innerCardSx } from "./Glass";

export type AuthMetric = { label: string; value: string };
export type AuthHighlight = { title: string; copy: string };

export function authTextFieldSx(): SxProps<Theme> {
  return {
    '& .MuiOutlinedInput-root': {
      borderRadius: 3.5,
      background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
      backdropFilter: 'blur(14px)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease',
      '& fieldset': {
        borderColor: 'rgba(255,255,255,0.10)',
      },
      '&:hover fieldset': {
        borderColor: 'rgba(124,255,178,0.22)',
      },
      '&.Mui-focused': {
        transform: 'translateY(-1px)',
        boxShadow: '0 18px 36px rgba(0,0,0,0.18)',
      },
      '&.Mui-focused fieldset': {
        borderColor: 'rgba(93,168,255,0.34)',
      },
    },
    '& .MuiInputLabel-root': {
      color: 'rgba(255,255,255,0.68)',
    },
    '& .MuiOutlinedInput-input': {
      color: '#fff',
      py: 1.55,
    },
    '& .MuiFormHelperText-root': {
      color: 'rgba(255,255,255,0.54)',
      marginLeft: 0.5,
    },
  };
}

export function AuthScaffold({
  eyebrow,
  title,
  subtitle,
  metrics,
  highlights,
  formTitle,
  formSubtitle,
  formIcon,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  metrics: AuthMetric[];
  highlights: AuthHighlight[];
  formTitle: string;
  formSubtitle: string;
  formIcon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: '100vh',
        px: { xs: 2, md: 3 },
        py: { xs: 3, md: 4 },
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background:
          'linear-gradient(180deg, #07101d 0%, #0a1425 55%, #07101d 100%)',
      }}
    >
      <Box className="cs-auth-bg-grid" />
      <Box className="cs-auth-orb cs-auth-orb-a" />
      <Box className="cs-auth-orb cs-auth-orb-b" />
      <Box className="cs-auth-orb cs-auth-orb-c" />

      <Box sx={{ width: '100%', maxWidth: 1220, position: 'relative', zIndex: 1 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', xl: '1.08fr 0.92fr' },
            gap: { xs: 2, md: 2.5 },
          }}
        >
          <GlassPanel sx={{ p: { xs: 2.2, md: 3.2 }, minHeight: { xl: 650 } }}>
            <Stack spacing={{ xs: 2.4, md: 3.2 }} justifyContent="space-between" sx={{ height: '100%' }}>
              <Box className="cs-fade-up">
                <Typography
                  variant="overline"
                  sx={{ letterSpacing: 2.2, color: 'rgba(255,255,255,0.62)', fontWeight: 900 }}
                >
                  {eyebrow}
                </Typography>
                <Typography
                  variant="h2"
                  sx={{
                    mt: 1.2,
                    fontWeight: 1000,
                    lineHeight: 1.02,
                    fontSize: { xs: 34, md: 58 },
                    maxWidth: 780,
                  }}
                >
                  {title}
                </Typography>
                <Typography
                  sx={{
                    mt: 2,
                    maxWidth: 700,
                    color: 'rgba(255,255,255,0.76)',
                    fontSize: { xs: 14.5, md: 16.5 },
                    lineHeight: 1.85,
                  }}
                >
                  {subtitle}
                </Typography>
              </Box>

              <Stack direction="row" spacing={1.1} flexWrap="wrap" useFlexGap>
                {metrics.map((metric) => (
                  <MetricBadge key={metric.label + metric.value} label={metric.label} value={metric.value} />
                ))}
              </Stack>

              <Box
                className="cs-stagger"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                  gap: 1.2,
                }}
              >
                {highlights.map((item) => (
                  <Paper key={item.title} sx={{ ...innerCardSx, p: 1.6, borderRadius: 4 }}>
                    <Typography sx={{ fontWeight: 900 }}>{item.title}</Typography>
                    <Typography className="cs-muted" sx={{ mt: 0.7, fontSize: 12.5, lineHeight: 1.75 }}>
                      {item.copy}
                    </Typography>
                  </Paper>
                ))}
              </Box>
            </Stack>
          </GlassPanel>

          <GlassPanel sx={{ p: { xs: 2.2, md: 3 }, display: 'flex', alignItems: 'center' }}>
            <Stack spacing={2.2} sx={{ width: '100%' }}>
              <Stack spacing={0.7} className="cs-fade-up">
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: 999,
                      display: 'grid',
                      placeItems: 'center',
                      background: 'rgba(124,255,178,0.12)',
                      border: '1px solid rgba(124,255,178,0.18)',
                      boxShadow: '0 16px 36px rgba(0,0,0,0.18)',
                    }}
                  >
                    {formIcon}
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 1000 }}>
                    {formTitle}
                  </Typography>
                </Stack>
                <Typography className="cs-muted" sx={{ fontSize: 13 }}>
                  {formSubtitle}
                </Typography>
              </Stack>

              <Paper
                sx={{
                  ...innerCardSx,
                  p: { xs: 1.7, md: 2 },
                  borderRadius: 4.2,
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025))',
                }}
              >
                {children}
              </Paper>
            </Stack>
          </GlassPanel>
        </Box>
      </Box>
    </Box>
  );
}
