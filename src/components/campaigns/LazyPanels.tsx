"use client";
import dynamic from "next/dynamic";
import SectionSkeleton from "@/components/app/SectionSkeleton";

// Below-fold, heavy panels — code-split so their JS loads after the above-fold
// triage view (toolbar, account picker, campaign table) rather than in this
// page's initial bundle, mirroring the repo's next/dynamic + SectionSkeleton
// convention (see ContentEngine). ReportView stays eager: the eager CampaignTable
// already imports it for per-row reports, so a dynamic wrapper here would add a
// skeleton flash for zero bundle win.
export const BudgetMoves = dynamic(() => import("./BudgetMoves"), {
  loading: () => <SectionSkeleton height="h-80" />,
});
export const SharedReportsList = dynamic(() => import("./SharedReportsList"), {
  loading: () => <SectionSkeleton height="h-32" lines={2} />,
});
export const ReportSettings = dynamic(() => import("./ReportSettings"), {
  loading: () => <SectionSkeleton height="h-80" />,
});
export const MicrositeCard = dynamic(() => import("./MicrositeCard"), {
  loading: () => <SectionSkeleton height="h-64" />,
});
export const ControlPlane = dynamic(() => import("./ControlPlane"), {
  loading: () => <SectionSkeleton height="h-48" lines={2} />,
});
export const SearchTermsPanel = dynamic(() => import("./SearchTermsPanel"), {
  loading: () => <SectionSkeleton height="h-64" lines={2} />,
});
