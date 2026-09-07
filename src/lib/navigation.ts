import {
  House,
  Target,
  CalendarDays,
  ClipboardList,
  BarChart3,
  BookOpen,
  FileText,
  Bot,
  Timer,
  PlugZap,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { label: "Home", href: "/", icon: House },
  { label: "Mission", href: "/mission", icon: Target },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Assignments", href: "/assignments", icon: ClipboardList },
  { label: "Courses", href: "/courses", icon: BookOpen },
  { label: "Grades", href: "/grades", icon: BarChart3 },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "AI Tutor", href: "/ai-tutor", icon: Bot },
  { label: "Study Tools", href: "/study-tools", icon: Timer },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Integrations", href: "/integrations", icon: PlugZap },
  { label: "Settings", href: "/settings", icon: Settings },
];
