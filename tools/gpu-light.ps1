# ---------------------------------------------------------------------------
# A red/green light that floats above every window and says whether the rented
# GPU is costing money right now.
#
# WHY IT EXISTS. Ak asked, and the reason is sound: "Claude remembers to turn it
# off" is an intention, not a control. This is a control he owns — it reads the
# same API the console reads, needs nothing from this app, and keeps working if
# every agent on the machine stops.
#
# Click the light to stop the instance. Nothing here can START one, deliberately:
# a widget that can spend money is a worse widget.
#
# Run it:   powershell -ExecutionPolicy Bypass -File tools/gpu-light.ps1
# Close it: click the X, or press Escape while it has focus.
#
# It changes nothing that outlives itself — no service, no scheduled task, no
# registry, no startup entry. Close it and it is gone.
# ---------------------------------------------------------------------------

param(
  [string]$Project  = "tier-1-ak",
  [int]   $EverySec = 30
)

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$win                   = New-Object System.Windows.Window
$win.Title             = "GPU"
$win.Width             = 208
$win.Height            = 96
$win.WindowStyle       = "None"
$win.AllowsTransparency= $true
$win.Background        = "#EE111318"
$win.Topmost           = $true          # the point of the whole thing
$win.ResizeMode        = "NoResize"
$win.WindowStartupLocation = "Manual"
# Top-right, clear of most window furniture.
$win.Left = [System.Windows.SystemParameters]::WorkArea.Width  - 224
$win.Top  = 16

$root = New-Object System.Windows.Controls.Grid
$root.Margin = "10"
$win.Content = $root

$stack = New-Object System.Windows.Controls.StackPanel
$stack.Orientation = "Horizontal"
$root.Children.Add($stack) | Out-Null

$dot = New-Object System.Windows.Shapes.Ellipse
$dot.Width = 26; $dot.Height = 26
$dot.Fill = "#666"
$dot.Margin = "0,0,10,0"
$dot.VerticalAlignment = "Center"
$stack.Children.Add($dot) | Out-Null

$text = New-Object System.Windows.Controls.TextBlock
$text.Foreground = "#EEE"
$text.FontFamily = "Segoe UI"
$text.FontSize = 12
$text.VerticalAlignment = "Center"
$text.Text = "checking…"
$stack.Children.Add($text) | Out-Null

# Drag from anywhere, since there is no title bar to grab.
$win.Add_MouseLeftButtonDown({ $win.DragMove() })
$win.Add_KeyDown({ if ($_.Key -eq "Escape") { $win.Close() } })

function Get-State {
  # --format=value keeps this to one word per instance, so a slow or chatty
  # gcloud cannot make the light lie.
  try {
    $out = & gcloud compute instances list --project=$Project `
             --format="value(name,status)" 2>$null
    if ([string]::IsNullOrWhiteSpace($out)) { return @("none", "no instances") }
    $running = @($out -split "`n" | Where-Object { $_ -match "RUNNING" })
    if ($running.Count -gt 0) {
      return @("running", (($running | ForEach-Object { ($_ -split "\s+")[0] }) -join ", "))
    }
    return @("stopped", "all terminated")
  } catch {
    return @("unknown", "gcloud unreachable")
  }
}

$refresh = {
  $s, $label = Get-State
  switch ($s) {
    "running" { $dot.Fill = "#FF3B30"; $text.Text = "BILLING`n$label" }
    "stopped" { $dot.Fill = "#34C759"; $text.Text = "off`n$label" }
    "none"    { $dot.Fill = "#34C759"; $text.Text = "off`n$label" }
    default   { $dot.Fill = "#FF9500"; $text.Text = "?`n$label" }
  }
}

# Click the light to stop whatever is running. Confirmed first, because a
# mis-click that kills a job mid-batch is its own kind of expensive.
$dot.Add_MouseLeftButtonUp({
  $s, $label = Get-State
  if ($s -ne "running") { return }
  $answer = [System.Windows.MessageBox]::Show(
    "Stop $label ?", "Stop instance", "YesNo", "Warning")
  if ($answer -eq "Yes") {
    $text.Text = "stopping…"
    $names = & gcloud compute instances list --project=$Project `
               --filter="status=RUNNING" --format="value(name,zone)" 2>$null
    foreach ($line in ($names -split "`n" | Where-Object { $_ })) {
      $n, $z = $line -split "\s+"
      & gcloud compute instances stop $n --zone=$z --project=$Project --quiet 2>$null
    }
    & $refresh
  }
})

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds($EverySec)
$timer.Add_Tick($refresh)
$timer.Start()

& $refresh
$win.ShowDialog() | Out-Null
