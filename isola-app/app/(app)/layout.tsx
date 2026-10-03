import TopBar from "@/components/shell/TopBar";
import Sidebar from "@/components/shell/Sidebar";
import BottomBar from "@/components/shell/BottomBar";
import HubTabs from "@/components/HubTabs";
import MainFrame from "@/components/MainFrame";
import QuickAdd from "@/components/QuickAdd";
import SearchPalette from "@/components/SearchPalette";
import Toaster from "@/components/Toaster";
import OfflineCache from "@/components/OfflineCache";
import JobForm from "@/components/job/JobForm";
import { TooltipProvider } from "@/components/ui/tooltip";

// v4.6 (10/3/26): Field Desk layout in Isola's black & white — top bar with the command
// bar, + New and the alerts bell; grouped sidebar with counts; phone bottom bar + Menu.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <Sidebar />
        <div className="flex flex-1 flex-col md:pl-[232px]">
          <MainFrame>
            <HubTabs />
            {children}
          </MainFrame>
        </div>
        <BottomBar />
        <QuickAdd />
        <JobForm />
        <SearchPalette />
        <Toaster />
        <OfflineCache />
      </div>
    </TooltipProvider>
  );
}
