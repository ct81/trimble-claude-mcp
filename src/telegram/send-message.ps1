[CmdletBinding()]
param(
    [string]$ChatId,
    [string]$Message
)

$ErrorActionPreference = 'Stop'
$GreenApiUrl = $env:GREEN_API_URL
$InstanceId = $env:GREEN_API_TELEGRAM_INSTANCE_ID
$SecureToken = $null
$Token = $null
$TokenPtr = [IntPtr]::Zero
$Failed = $false

try {
    if ([string]::IsNullOrWhiteSpace($GreenApiUrl)) {
        $GreenApiUrl = Read-Host 'Enter GREEN_API_URL'
    }

    if ([string]::IsNullOrWhiteSpace($InstanceId)) {
        $InstanceId = Read-Host 'Enter GREEN_API_TELEGRAM_INSTANCE_ID'
    }

    $SecureToken = Read-Host 'Enter GREEN_API_TELEGRAM_TOKEN' -AsSecureString
    if ($SecureToken.Length -eq 0) {
        throw 'A GREEN-API Telegram token is required.'
    }

    $TokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureToken)
    $Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($TokenPtr)

    if ([string]::IsNullOrWhiteSpace($ChatId)) {
        $ChatId = Read-Host 'Enter Telegram chat ID'
    }

    if ([string]::IsNullOrWhiteSpace($Message)) {
        $Message = Read-Host 'Enter the message to send'
    }

    if ([string]::IsNullOrWhiteSpace($GreenApiUrl) -or
        [string]::IsNullOrWhiteSpace($InstanceId) -or
        [string]::IsNullOrWhiteSpace($ChatId) -or
        [string]::IsNullOrWhiteSpace($Message)) {
        throw 'GREEN_API_URL, instance ID, chat ID, and message are required.'
    }

    $Endpoint = '{0}/waInstance{1}/sendMessage/{2}' -f `
        $GreenApiUrl.TrimEnd('/'), $InstanceId.Trim(), $Token
    $Payload = @{
        chatId  = $ChatId.Trim()
        message = $Message
    } | ConvertTo-Json -Compress

    $Response = Invoke-RestMethod `
        -Uri $Endpoint `
        -Method Post `
        -ContentType 'application/json; charset=utf-8' `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($Payload)) `
        -TimeoutSec 30

    Write-Host 'Telegram message sent successfully.' -ForegroundColor Green
    if ($null -ne $Response) {
        $Response | ConvertTo-Json -Depth 10
    }
}
catch {
    $StatusCode = $null
    if ($null -ne $_.Exception.Response -and
        $null -ne $_.Exception.Response.StatusCode) {
        $StatusCode = [int]$_.Exception.Response.StatusCode
    }

    if ($null -ne $StatusCode) {
        [Console]::Error.WriteLine("Telegram send failed (HTTP $StatusCode). Check GREEN-API configuration and connectivity.")
    }
    else {
        [Console]::Error.WriteLine('Telegram send failed. Check GREEN-API configuration and connectivity.')
    }
    $Failed = $true
}
finally {
    if ($TokenPtr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($TokenPtr)
    }

    $Token = $null
    if ($null -ne $SecureToken) {
        $SecureToken.Dispose()
    }
}

if ($Failed) {
    exit 1
}
