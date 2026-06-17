/** The authed product layout: a fixed left rail (sidebar) + a slim topbar over a
 *  scrollable content column. Server component — it only arranges the client
 *  sidebar / topbar around the (server-rendered) module page, so module pages
 *  stay server components where they can. The marketing chrome is hidden on /app
 *  (ChromeGate), so this owns the full viewport. */
import AppSidebar from "@/components/app/AppSidebar";
import AppTopbar from "@/components/app/AppTopbar";
import { AppShellProvider } from "@/components/app/shell-context";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShellProvider>
      <div className="flex min-h-screen bg-canvas">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar />
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </AppShellProvider>
  );
}
