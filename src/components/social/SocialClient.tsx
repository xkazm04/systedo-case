"use client";

import dynamic from "next/dynamic";
import AccountsBar from "./AccountsBar";
import Composer from "./Composer";
import Inbox from "./Inbox";
import PostsList from "./PostsList";
import SectionSkeleton from "@/components/app/SectionSkeleton";
import WeekPlanner from "./WeekPlanner";

/** The publishing calendar leads the module: it is the only surface that answers
 *  "what actually goes out this week" across all four schedulers, so everything
 *  below it is a way of ADDING to a week you have already seen.
 *
 *  Lazy: it is the one section here that costs a network round-trip of its own
 *  (the /publishing resolver reads five stores), and nothing above the fold needs
 *  it to paint. SectionSkeleton reserves the height so the swap does not fight the
 *  staggered reveal. */
const PublishingCalendar = dynamic(() => import("./PublishingCalendar"), {
  loading: () => <SectionSkeleton height="h-80" />,
});

export default function SocialClient() {
  return (
    <div className="stagger space-y-8">
      <AccountsBar />
      <PublishingCalendar />
      <WeekPlanner />
      <div className="grid gap-6 lg:grid-cols-[420px_1fr] lg:items-start">
        <Composer />
        <PostsList />
      </div>
      <Inbox />
    </div>
  );
}
