import type { Metadata } from "next";
import { DemoDeck } from "@/components/demo/DemoDeck";

export const metadata: Metadata = {
  title: "Heard · Demo",
  description:
    "Problem, Live, recovery pipeline, Share, and My Words — how Heard works.",
};

export default function DemoPage() {
  return <DemoDeck />;
}
