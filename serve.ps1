[CmdletBinding()]
param(
    [int]$Port = 8080,
    [switch]$NoBrowser,
    [switch]$Lan
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$rootPrefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

# Группа ПДА: участники хранятся в памяти и пропадают, если давно не выходили на связь.
$groupMembers = @{}
$groupMessages = @()
$groupChatTtlSeconds = 300
$groupTtlSeconds = 30
$groupMaxBodyBytes = 4194304
$groupPortraitMaxChars = 3100000

function Get-MimeType([string]$filePath) {
    switch ([IO.Path]::GetExtension($filePath).ToLowerInvariant()) {
        '.html' { 'text/html; charset=utf-8'; break }
        '.css' { 'text/css; charset=utf-8'; break }
        '.js' { 'text/javascript; charset=utf-8'; break }
        '.json' { 'application/json; charset=utf-8'; break }
        '.webmanifest' { 'application/manifest+json; charset=utf-8'; break }
        '.svg' { 'image/svg+xml'; break }
        '.png' { 'image/png'; break }
        '.jpg' { 'image/jpeg'; break }
        '.jpeg' { 'image/jpeg'; break }
        '.webp' { 'image/webp'; break }
        '.ico' { 'image/x-icon'; break }
        '.txt' { 'text/plain; charset=utf-8'; break }
        default { 'application/octet-stream' }
    }
}

function Read-RequestHead([System.IO.Stream]$stream) {
    $buffer = New-Object System.Collections.Generic.List[byte]
    $single = New-Object byte[] 1
    while ($true) {
        $n = $stream.Read($single, 0, 1)
        if ($n -le 0) { break }
        $buffer.Add($single[0])
        $count = $buffer.Count
        if ($count -ge 4 -and $buffer[$count - 4] -eq 13 -and $buffer[$count - 3] -eq 10 -and $buffer[$count - 2] -eq 13 -and $buffer[$count - 1] -eq 10) { break }
        if ($count -gt 16384) { break }
    }
    return [System.Text.Encoding]::ASCII.GetString($buffer.ToArray())
}

function Read-RequestBody([System.IO.Stream]$stream, [int]$length) {
    $body = New-Object byte[] $length
    $offset = 0
    while ($offset -lt $length) {
        $n = $stream.Read($body, $offset, $length - $offset)
        if ($n -le 0) { break }
        $offset += $n
    }
    if ($offset -lt $length) { return $null }
    return $body
}

function Send-Bytes([System.IO.Stream]$stream, [string]$status, [string]$mime, [byte[]]$bytes, [string]$method) {
    $header = "HTTP/1.1 $status`r`nContent-Type: $mime`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: Content-Type`r`nCache-Control: no-store, no-cache, must-revalidate`r`nPragma: no-cache`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($method -ne 'HEAD' -and $bytes.Length -gt 0) {
        $stream.Write($bytes, 0, $bytes.Length)
    }
    $stream.Flush()
}

function Send-Json([System.IO.Stream]$stream, [string]$status, [string]$json, [string]$method) {
    Send-Bytes $stream $status 'application/json; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes($json)) $method
}

function Remove-StaleGroupMessages {
    $cutoff = [DateTime]::UtcNow.AddSeconds(-$groupChatTtlSeconds)
    $script:groupMessages = @($script:groupMessages | Where-Object { $_.at -ge $cutoff })
    if ($script:groupMessages.Count -gt 200) {
        $script:groupMessages = @($script:groupMessages | Select-Object -Last 200)
    }
}

function Remove-StaleGroupMembers {
    $cutoff = [DateTime]::UtcNow.AddSeconds(-$groupTtlSeconds)
    foreach ($key in @($groupMembers.Keys)) {
        if ($groupMembers[$key].seen -lt $cutoff) { $groupMembers.Remove($key) }
    }
}

function Get-GroupJson([string]$selfId) {
    Remove-StaleGroupMembers
    Remove-StaleGroupMessages
    $members = @()
    foreach ($member in $groupMembers.Values) {
        if ($member.id -eq $selfId) { continue }
        $members += [ordered]@{
            id = $member.id
            name = $member.name
            nickname = $member.nickname
            rank = $member.rank
            portrait = $member.portrait
        }
    }
    $messages = @()
    foreach ($msg in $script:groupMessages) {
        if ($msg.from -eq $selfId -or $msg.to -eq $selfId -or $msg.to -eq '*') {
            $messages += [ordered]@{ from = $msg.from; to = $msg.to; text = $msg.text; at = $msg.at }
        }
    }
    $emptyMembers = $members.Count -eq 0
    $emptyMessages = $messages.Count -eq 0
    $membersJson = '[]'
    if (-not $emptyMembers) {
        $membersJson = ConvertTo-Json -InputObject $members -Depth 6 -Compress
        if (-not $membersJson.StartsWith('[')) { $membersJson = "[$membersJson]" }
    }
    $messagesJson = '[]'
    if (-not $emptyMessages) {
        $messagesJson = ConvertTo-Json -InputObject $messages -Depth 6 -Compress
        if (-not $messagesJson.StartsWith('[')) { $messagesJson = "[$messagesJson]" }
    }
    return '{"members":' + $membersJson + ',"messages":' + $messagesJson + '}'
}

function Send-GroupMessage([string]$body) {
    $data = $body | ConvertFrom-Json
    $from = [string]$data.from
    if ($from -notmatch '^[A-Za-z0-9-]{4,24}$') { throw 'Некорректный отправитель' }
    $to = [string]$data.to
    if ($to -ne '*' -and $to -notmatch '^[A-Za-z0-9-]{4,24}$') { throw 'Некорректный получатель' }
    $text = [string]$data.text
    if ($text.Length -gt 1000) { $text = $text.Substring(0, 1000) }
    if ([string]::IsNullOrWhiteSpace($text)) { return }
    Remove-StaleGroupMessages
    $script:groupMessages += [ordered]@{
        from = $from
        to = $to
        text = $text
        at = [DateTime]::UtcNow.ToString('o')
    }
}

function Set-GroupMember([string]$body) {
    $data = $body | ConvertFrom-Json
    $id = [string]$data.id
    if ($id -notmatch '^[A-Za-z0-9-]{4,24}$') { throw 'Некорректный идентификатор' }
    $name = [string]$data.name
    $nickname = [string]$data.nickname
    if ($name.Length -gt 80) { $name = $name.Substring(0, 80) }
    if ($nickname.Length -gt 40) { $nickname = $nickname.Substring(0, 40) }
    $rank = [int][Math]::Round([double]$data.rank)
    if ($rank -lt 1) { $rank = 1 }
    if ($rank -gt 5) { $rank = 5 }
    $portrait = $null
    if ($data.portrait) {
        $portrait = [string]$data.portrait
        if ($portrait.Length -gt $groupPortraitMaxChars -or -not $portrait.StartsWith('data:image/')) { $portrait = $null }
    }
    $groupMembers[$id] = @{
        id = $id
        name = $name
        nickname = $nickname
        rank = $rank
        portrait = $portrait
        seen = [DateTime]::UtcNow
    }
}

function Get-QueryValue([string]$query, [string]$key) {
    foreach ($pair in $query.Split('&')) {
        $parts = $pair.Split('=', 2)
        if ($parts[0] -eq $key -and $parts.Length -eq 2) { return [Uri]::UnescapeDataString($parts[1]) }
    }
    return ''
}

function Handle-GroupApi([System.IO.Stream]$stream, [string]$method, [string]$route, [string]$query, [int]$length) {
    try {
        if ($route -eq '/api/group/announce') {
            if ($method -ne 'POST') { Send-Json $stream '405 Method Not Allowed' '{"error":"method"}' $method; return }
            if ($length -le 0 -or $length -gt $groupMaxBodyBytes) { Send-Json $stream '413 Payload Too Large' '{"error":"size"}' $method; return }
            $bodyBytes = Read-RequestBody $stream $length
            if ($null -eq $bodyBytes) { Send-Json $stream '400 Bad Request' '{"error":"body"}' $method; return }
            Set-GroupMember ([System.Text.Encoding]::UTF8.GetString($bodyBytes))
            Send-Json $stream '200 OK' '{"ok":true}' $method
            return
        }
        if ($route -eq '/api/group/message') {
            if ($method -ne 'POST') { Send-Json $stream '405 Method Not Allowed' '{"error":"method"}' $method; return }
            if ($length -le 0 -or $length -gt $groupMaxBodyBytes) { Send-Json $stream '413 Payload Too Large' '{"error":"size"}' $method; return }
            $bodyBytes = Read-RequestBody $stream $length
            if ($null -eq $bodyBytes) { Send-Json $stream '400 Bad Request' '{"error":"body"}' $method; return }
            Send-GroupMessage ([System.Text.Encoding]::UTF8.GetString($bodyBytes))
            Send-Json $stream '200 OK' '{"ok":true}' $method
            return
        }
        if ($route -eq '/api/group/list') {
            if ($method -ne 'GET' -and $method -ne 'HEAD') { Send-Json $stream '405 Method Not Allowed' '{"error":"method"}' $method; return }
            $selfId = (Get-QueryValue $query 'self').ToUpperInvariant()
            Send-Json $stream '200 OK' (Get-GroupJson $selfId) $method
            return
        }
        Send-Json $stream '404 Not Found' '{"error":"not found"}' $method
    } catch {
        Send-Json $stream '400 Bad Request' '{"error":"invalid"}' $method
    }
}

$bindAddress = if ($Lan) { [System.Net.IPAddress]::Any } else { [System.Net.IPAddress]::Loopback }

$listener = $null
try {
    $listener = New-Object System.Net.Sockets.TcpListener($bindAddress, $Port)
    $listener.Start()
} catch {
    Write-Host ''
    Write-Host "Не удалось запустить сервер на порту $Port." -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

$url = "http://localhost:$Port/"
Write-Host ''
Write-Host '  ПДА-2М // локальный сервер' -ForegroundColor Yellow
Write-Host "  Адрес: $url"
if ($Lan) {
    try {
        $addresses = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
            Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork }
        foreach ($address in $addresses) {
            Write-Host "  С телефона: http://$($address.IPAddressToString):$Port/"
        }
    } catch {
        Write-Host '  С телефона: http://<IP-этого-компьютера>:' + $Port + '/'
    }
    Write-Host '  Группа ПДА: вкладка «Группа» работает, пока этот сервер запущен.' -ForegroundColor DarkYellow
    Write-Host '  Внимание: режим -Lan открывает папку приложения для всей локальной сети.' -ForegroundColor DarkYellow
}
Write-Host '  Остановить: Ctrl+C'
Write-Host ''

if (-not $NoBrowser) {
    Start-Process $url | Out-Null
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $client.ReceiveTimeout = 5000
            $stream = $client.GetStream()
            $stream.ReadTimeout = 5000
            $stream.WriteTimeout = 5000

            $head = Read-RequestHead $stream
            $lines = $head.Split(@("`r`n"), [StringSplitOptions]::None)
            $requestLine = $lines[0]
            if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

            $headers = @{}
            foreach ($line in $lines[1..($lines.Length - 1)]) {
                if ([string]::IsNullOrEmpty($line)) { continue }
                $idx = $line.IndexOf(':')
                if ($idx -gt 0) { $headers[$line.Substring(0, $idx).Trim().ToLowerInvariant()] = $line.Substring($idx + 1).Trim() }
            }

            $parts = $requestLine.Split(' ')
            if ($parts.Length -lt 2) { continue }

            $method = $parts[0].ToUpperInvariant()
            $target = $parts[1]
            $pathOnly = $target.Split('?')[0]
            $query = ''
            if ($target.Contains('?')) { $query = $target.Substring($target.IndexOf('?') + 1) }

            if ($method -eq 'OPTIONS' -and $pathOnly.StartsWith('/api/group/')) {
                Send-Bytes $stream '204 No Content' 'text/plain; charset=utf-8' ([byte[]]@()) 'HEAD'
                continue
            }

            if ($pathOnly.StartsWith('/api/group/')) {
                $length = 0
                if ($headers.ContainsKey('content-length')) { [int]::TryParse($headers['content-length'], [ref]$length) | Out-Null }
                Handle-GroupApi $stream $method $pathOnly $query $length
                continue
            }

            $status = '200 OK'
            $responseBytes = [byte[]]@()
            $mime = 'text/plain; charset=utf-8'

            if ($method -ne 'GET' -and $method -ne 'HEAD') {
                $status = '405 Method Not Allowed'
                $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('Method Not Allowed')
            } else {
                try {
                    $decoded = [Uri]::UnescapeDataString($pathOnly)
                } catch {
                    $decoded = $pathOnly
                }
                if ([string]::IsNullOrWhiteSpace($decoded) -or $decoded -eq '/') {
                    $decoded = '/index.html'
                }

                $relative = $decoded.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
                $fullPath = $null
                try {
                    $fullPath = [IO.Path]::GetFullPath((Join-Path $root $relative))
                } catch {
                    $fullPath = $null
                }

                if (-not $fullPath -or -not $fullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
                    $status = '403 Forbidden'
                    $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
                } elseif (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
                    $status = '404 Not Found'
                    $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
                } else {
                    $mime = Get-MimeType $fullPath
                    $responseBytes = [IO.File]::ReadAllBytes($fullPath)
                }
            }

            Send-Bytes $stream $status $mime $responseBytes $method
        } catch {
            # Ошибка одного запроса не должна останавливать сервер.
        } finally {
            $client.Close()
        }
    }
} finally {
    if ($listener) { $listener.Stop() }
    Write-Host ''
    Write-Host 'Сервер остановлен.'
}
