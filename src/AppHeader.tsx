import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";

type AppHeaderProps = {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenCatalogue: () => void;
};

export function AppHeader({ isDark, onToggleTheme, onOpenCatalogue }: AppHeaderProps) {
  useEffect(() => {
    try {
      const root = document.documentElement;
      if (isDark) root.classList.add("dark");
      else root.classList.remove("dark");
      localStorage.setItem("theme", isDark ? "dark" : "light");
      window.dispatchEvent(new CustomEvent("theme-toggle", { detail: { dark: isDark } }));
    } catch (e) {
      /* noop */
    }
  }, [isDark]);

  return (
    <Card className="mb-6 bg-transparent border-none shadow-none rounded-none p-0">
      <CardHeader className="px-0 pb-3">
        <div className="w-full flex items-center justify-between">
          <div className="flex-1">
            <CardTitle className="text-3xl font-bold">Pulsar-PReSPIDAR</CardTitle>
            <div className="text-sm mt-1 font-semibold text-muted-foreground">
              Pulsar-Polarisation REsolved Single Pulse Interactive Data AnalyseR
            </div>
          </div>
          <div className="ml-4 space-x-2 flex">
            <Button variant="outline" onClick={onOpenCatalogue}>
              Browse Catalogue
            </Button>
            <Button variant="outline" onClick={onToggleTheme}>
              {isDark ? "Light Mode" : "Dark Mode"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <div className="text-center text-base text-muted-foreground mb-2">
          An open-source data-analysis tool for visualizing and exploring single-pulse polarimetry data from the <a href="https://psrweb.jb.man.ac.uk/meertime/singlepulse/" className="underline text-accent" target="_blank" rel="noopener noreferrer">MeerTime Single Pulse Database</a>.
        </div>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="mx-auto block">Details</Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-4 space-y-2">
              <div><b>Default MeerTime Link:</b></div>
              <div className="break-all text-sm bg-card p-2 rounded">https://psrweb.jb.man.ac.uk/meertime/singlepulse/J0835-4510/2020-12-26-21:39:16/1284/plots/2020-12-26-21:39:16.npz</div>
              {/* Add more details columns here as needed */}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
