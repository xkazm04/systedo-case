"use client";

import AccountsBar from "./AccountsBar";
import Composer from "./Composer";
import Inbox from "./Inbox";
import PostsList from "./PostsList";
import WeekPlanner from "./WeekPlanner";

export default function SocialClient() {
  return (
    <div className="space-y-8">
      <AccountsBar />
      <WeekPlanner />
      <div className="grid gap-6 lg:grid-cols-[420px_1fr] lg:items-start">
        <Composer />
        <PostsList />
      </div>
      <Inbox />
    </div>
  );
}
