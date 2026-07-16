# Keep MSAL's delegated credential in the user context. The CLI launches this
# script in a new PowerShell process whenever its one-hour access token expires;
# Process scope would therefore force an interactive login on each renewal.
Connect-MgGraph -Scopes "Mail.Read","Mail.ReadWrite","Calendars.Read" -ContextScope CurrentUser -NoWelcome

# Grab your signed-in account (UPN) from the current Graph context
$upn = (Get-MgContext).Account

# Make a harmless Graph call and capture the underlying HTTP exchange
$resp  = Invoke-MgGraphRequest -Method GET -Uri 'https://graph.microsoft.com/v1.0/me' -OutputType HttpResponseMessage
$token = $resp.RequestMessage.Headers.Authorization.Parameter

echo TOKEN=$token