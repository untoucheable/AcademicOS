import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  MessageSquare,
  Wrench,
  Calendar,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Assignments", href: "/assignments", icon: ClipboardList },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "AI Chat", href: "/ai-chat", icon: MessageSquare },
  { label: "Study Tools", href: "/study-tools", icon: Wrench },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Settings", href: "/settings", icon: Settings },
];
