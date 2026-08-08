# Export this machine's Windows certificate store to a PEM bundle.
#
# WHY THIS IS NEEDED. Antivirus with HTTPS scanning — Avast on this machine,
# and Kaspersky, ESET and Bitdefender all do the same — terminates TLS itself
# and re-signs every response with its own root certificate, which it installs
# in the WINDOWS store. Windows and every browser trust it. Python does not:
# it ships its own CA list (certifi) and reads nothing from the OS, so every
# HTTPS call fails with:
#
#     CERTIFICATE_VERIFY_FAILED: unable to get local issuer certificate
#
# That is what stopped `hf auth whoami` from working even though the login had
# succeeded, and it is the same root cause as the Electron side of the app
# failing to reach Freesound. Pointing SSL_CERT_FILE at this bundle hands
# Python the same trust the rest of the machine already has.
#
# NOT COMMITTED. The bundle is specific to this machine — a different antivirus
# or a different company laptop needs a different one — so it is generated
# rather than shipped. Re-run this if the antivirus is changed or reinstalled.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File tools/make-ca-bundle.ps1

$out = Join-Path $PSScriptRoot "windows-ca-bundle.pem"
$sb = New-Object System.Text.StringBuilder
$count = 0

foreach ($store in @("Cert:\LocalMachine\Root", "Cert:\CurrentUser\Root",
                     "Cert:\LocalMachine\CA",   "Cert:\CurrentUser\CA")) {
  Get-ChildItem $store -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $b64 = [System.Convert]::ToBase64String($_.RawData, 'InsertLineBreaks')
      [void]$sb.AppendLine("# " + $_.Subject)
      [void]$sb.AppendLine("-----BEGIN CERTIFICATE-----")
      [void]$sb.AppendLine($b64)
      [void]$sb.AppendLine("-----END CERTIFICATE-----")
      $count++
    } catch { }
  }
}

[System.IO.File]::WriteAllText($out, $sb.ToString())
Write-Host "Wrote $count certificates to $out"
if ((Get-Content $out -Raw) -match "Avast|Kaspersky|ESET|Bitdefender") {
  Write-Host "An antivirus root IS present - this bundle is doing real work here."
}
