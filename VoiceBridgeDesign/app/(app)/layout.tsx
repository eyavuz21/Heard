import { PhoneShell } from "@/components/PhoneShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <PhoneShell>{children}</PhoneShell>;
}
