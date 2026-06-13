import React from "react";
import { Chip, ListItem, ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import { SvgIconComponent } from "@mui/icons-material";

interface SidebarItemProps {
  icon: SvgIconComponent;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string | number;
}

export function SidebarItem({ icon: Icon, label, active, onClick, badge }: SidebarItemProps) {
  return (
    <ListItem disablePadding>
      <ListItemButton 
        selected={active} 
        onClick={onClick}
        sx={{ 
          borderRadius: 3, 
          mx: 1.5, 
          mb: 0.75,
          py: 1.25,
          transition: 'all 0.2s',
          "&.Mui-selected": { 
            bgcolor: "primary.main", 
            color: "white",
            boxShadow: "0 4px 12px rgba(20, 108, 92, 0.25)",
            "&:hover": { bgcolor: "primary.dark" },
            "& .MuiListItemIcon-root": { color: "white" }
          },
          "&:hover": { bgcolor: "rgba(20, 108, 92, 0.04)" }
        }}
      >
        <ListItemIcon sx={{ minWidth: 40, color: active ? "white" : "text.secondary" }}>
          <Icon fontSize="small" />
        </ListItemIcon>
        <ListItemText 
          primary={label} 
          primaryTypographyProps={{ 
            variant: 'body2', 
            fontWeight: active ? 700 : 600,
            fontSize: '0.9rem'
          }} 
        />
        {badge && (
          <Chip 
            label={String(badge)} 
            size="small" 
            color={active ? "secondary" : "default"} 
            sx={{ height: 20, fontSize: '0.65rem', fontWeight: 800 }} 
          />
        )}
      </ListItemButton>
    </ListItem>
  );
}
