# Opens inbound firewall rules for the ElimuAR LAN demo.
# Run elevated (UAC prompt): used by the demo setup so other PCs and phones
# on the same Wi-Fi can reach the portal (3000) and the API (4000).

Start-Transcript -Path "C:\elimuar-fw.log" -Force

$ports = @(
  @{ Name = "ElimuAR API (4000)"; Port = 4000 },
  @{ Name = "ElimuAR Web (3000)"; Port = 3000 }
)

foreach ($p in $ports) {
  $existing = Get-NetFirewallRule -DisplayName $p.Name -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Rule already present: $($p.Name)"
    continue
  }
  New-NetFirewallRule -DisplayName $p.Name `
    -Direction Inbound -Action Allow -Protocol TCP -LocalPort $p.Port | Out-Null
  Write-Host "Rule added: $($p.Name)"
}

Stop-Transcript
