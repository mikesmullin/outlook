Connect-MgGraph -Scopes "Mail.Read","Mail.ReadWrite"

# Grab your signed-in account (UPN) from the current Graph context
$upn = (Get-MgContext).Account

# Make a harmless Graph call and capture the underlying HTTP exchange
$resp  = Invoke-MgGraphRequest -Method GET -Uri 'https://graph.microsoft.com/v1.0/me' -OutputType HttpResponseMessage
$token = $resp.RequestMessage.Headers.Authorization.Parameter

echo TOKEN=$token