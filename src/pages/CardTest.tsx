import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function CardTest() {
  const toggleDark = () => {
    document.documentElement.classList.toggle("dark")
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <Card className="flex flex-row items-stretch gap-0 overflow-hidden rounded-2xl shadow-2xl border-0 card-surface text-card-foreground">
          <div className="flex-1 p-6 flex flex-col justify-between">
            <div>
              <CardHeader className="p-0">
                <div>
                  <CardTitle className="text-2xl text-card-foreground">Card Test</CardTitle>
                  <CardDescription className="text-sm text-muted-foreground">Simple shadcn-style card for visual testing.</CardDescription>
                </div>
              </CardHeader>

              <CardContent className="p-0 mt-6">
                <p className="text-base text-card-foreground">
                  This is a test card to verify styling, dark mode, and component integration. The layout
                  is horizontal and uses a dark gradient background. Use the button on the right to toggle the theme.
                </p>
              </CardContent>
            </div>

            <div className="mt-6">
              <div className="text-xs text-muted-foreground">Status: ready</div>
            </div>
          </div>

          <div className="w-56 p-6 flex flex-col justify-between bg-card">
            <div className="flex flex-col gap-3">
              <Button variant="outline" onClick={toggleDark} className="w-full">Toggle Dark</Button>
              <Button variant="ghost" className="w-full">Secondary</Button>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1">Cancel</Button>
              <Button className="flex-1">Confirm</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
