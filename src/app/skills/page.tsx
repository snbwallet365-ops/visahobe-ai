"use client";

import { useState } from "react";
import Link from "next/link";
import { SKILLS, SKILL_GROUPS } from "@/lib/skills";
import { PageHeader, Stat } from "@/components/ui";

export default function SkillsPage() {
  const [group, setGroup] = useState<string>("সব");
  const groups = ["সব", ...SKILL_GROUPS];
  const list = group === "সব" ? SKILLS : SKILLS.filter((s) => s.group === group);

  return (
    <div>
      <PageHeader title="দক্ষতা" subtitle="VisaHOBe AI যেসব কাজ নিজে থেকে করতে পারে" />

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="মোট দক্ষতা" value={SKILLS.length.toLocaleString("bn-BD")} />
          <Stat label="বিভাগ" value={SKILL_GROUPS.length.toLocaleString("bn-BD")} />
          <Stat label="সমর্থিত দেশ" value={"১৫"} hint="ওয়ার্ক ভিসা ও পারমিট" />
        </div>

        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <button key={g} onClick={() => setGroup(g)} className={`cx-btn ${group === g ? "cx-btn-dark" : "cx-btn"}`}>
              {g}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s, i) => (
            <Link
              key={s.key}
              href={s.href}
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              className="cx-card cx-fade p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(60,64,67,.1)]"
            >
              <div className="mb-2 text-[22px]">{s.icon}</div>
              <div className="text-[14px] font-medium">{s.name}</div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-muted)]">{s.desc}</div>
              <div className="mt-3 text-[11.5px] text-[var(--color-brand)]">{s.group} →</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
