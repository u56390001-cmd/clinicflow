$ErrorActionPreference = "Stop"
$base = "https://ntkuxmrhpigzyeutffjc.supabase.co"
$key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50a3V4bXJocGlnenlldXRmZmpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MTU3NzMsImV4cCI6MjEwMjM5MTc3M30._aexrDSTx_X7EFOAThggKgaeN_pDTmy3V2igqM5hseU"
$pass = "Phase1Test-Password-123"

function Auth($email) {
  $body = @{ email = $email; password = $pass } | ConvertTo-Json
  try {
    $r = Invoke-WebRequest -Uri "$base/auth/v1/token?grant_type=password" -Method POST -Headers @{ apikey = $key; "Content-Type" = "application/json" } -Body $body -UseBasicParsing -TimeoutSec 30
    return $r.Content | ConvertFrom-Json
  } catch {
    $r = Invoke-WebRequest -Uri "$base/auth/v1/signup" -Method POST -Headers @{ apikey = $key; "Content-Type" = "application/json" } -Body $body -UseBasicParsing -TimeoutSec 30
    return $r.Content | ConvertFrom-Json
  }
}

function Api($method, $path, $token, $body) {
  $h = @{ apikey = $key; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" }
  if ($null -eq $body) { $h.Remove("Content-Type"); $h.Remove("Prefer") }
  $args = @{ Uri = "$base/rest/v1/$path"; Method = $method; Headers = $h; UseBasicParsing = $true; TimeoutSec = 30 }
  if ($null -ne $body) { $args.Body = $body }
  try { $r = Invoke-WebRequest @args; return @{ status = $r.StatusCode; data = $r.Content } }
  catch { return @{ status = $_.Exception.Response.StatusCode.value__; data = $_.Exception.Message } }
}

$c = Auth "medbook.phase1.c@gmail.com"
$d = Auth "medbook.phase1.d@gmail.com"
$cId = $c.user.id
$dId = $d.user.id
Write-Output "== C id: $cId | D id: $dId =="

$clinicBody = '{"name":"Test Clinic C","slug":"test-clinic-c","doctor_name":"Dr C","timezone":"UTC","email":"front@testclinicc.com","created_by":"' + $cId + '"}'
$clinic = Api "POST" "clinics" $c.access_token $clinicBody
Write-Output "1) C creates clinic -> $($clinic.status) $($clinic.data)"
$clinicId = ""
if ($clinic.status -eq 201) { $clinicId = ($clinic.data | ConvertFrom-Json).id }

$memberBody = '{"clinic_id":"' + $clinicId + '","user_id":"' + $cId + '","role":"owner"}'
$member = Api "POST" "clinic_members" $c.access_token $memberBody
Write-Output "2) C creates own owner membership -> $($member.status) $($member.data)"

$readC = Api "GET" "clinics?select=id,slug,name&slug=eq.test-clinic-c" $c.access_token $null
Write-Output "3) C reads own clinic -> $($readC.status) $($readC.data)"

$readD = Api "GET" "clinics?select=id,slug,name&slug=eq.test-clinic-c" $d.access_token $null
Write-Output "4) D reads C's clinic (expect []) -> $($readD.status) $($readD.data)"

$updateD = Api "PATCH" "clinics?slug=eq.test-clinic-c" $d.access_token '{"name":"hacked by D"}'
Write-Output "5) D tries update C's clinic (expect 0 rows/204) -> $($updateD.status) $($updateD.data)"

$deleteD = Api "DELETE" "clinics?slug=eq.test-clinic-c" $d.access_token $null
Write-Output "6) D tries delete C's clinic (expect 204) -> $($deleteD.status)"

$stillC = Api "GET" "clinics?select=slug,name&slug=eq.test-clinic-c" $c.access_token $null
Write-Output "7) clinic still owned by C -> $($stillC.status) $($stillC.data)"

$memberBodyD = '{"clinic_id":"' + $clinicId + '","user_id":"' + $dId + '","role":"owner"}'
$memberD = Api "POST" "clinic_members" $d.access_token $memberBodyD
Write-Output "8) D tries to add self as owner of C's clinic (RLS must reject) -> $($memberD.status)"

$membersC = Api "GET" "clinic_members?select=user_id,role&clinic_id=eq.$clinicId" $c.access_token $null
Write-Output "9) memberships of clinic as C -> $($membersC.status) $($membersC.data)"

Write-Output "clinicId=$clinicId"
