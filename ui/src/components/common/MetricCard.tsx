import React from "react";
import { Box, Card, CardContent, Typography } from "@mui/material";
import { SvgIconComponent } from "@mui/icons-material";

interface MetricCardProps {
  label: string;
  value: string | number;
  note?: string;
  color?: "primary" | "secondary" | "success" | "warning" | "error" | "info";
  icon?: SvgIconComponent;
}

export function MetricCard({ label, value, note, color = "primary", icon: Icon }: MetricCardProps) {
  return (
    <Card variant="outlined" sx={{ 
      position: 'relative', 
      overflow: 'hidden',
      height: '100%',
      transition: 'all 0.2s ease-in-out',
      "&:hover": { 
        transform: 'translateY(-4px)',
        boxShadow: "0 12px 24px rgba(0, 0, 0, 0.06)",
        borderColor: `${color}.main`
      }
    }}>
      <Box sx={{ 
        position: 'absolute', 
        right: -10, 
        top: -10, 
        opacity: 0.05, 
        transform: 'scale(2.5)',
        color: `${color}.main`
      }}>
        {Icon && <Icon fontSize="large" />}
      </Box>
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Typography variant="overline" sx={{ display: 'block', mb: 1 }}>
          {label}
        </Typography>
        <Typography variant="h4" color={`${color}.main`} sx={{ fontWeight: 800 }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontWeight: 500, fontSize: '0.85rem' }}>
          {note}
        </Typography>
      </CardContent>
    </Card>
  );
}
