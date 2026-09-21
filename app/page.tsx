"use client";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { TimelineApp } from "@/features/timeline/timeline-app";

export default function Home() {
  return (
    <LocaleProvider>
      <TimelineApp />
    </LocaleProvider>
  );
}
