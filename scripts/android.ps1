param(
    [ValidateSet('Debug', 'Release')][string]$Configuration = 'Release',
    [switch]$Install,
    [string]$Serial
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    # Keep the downloaded toolchain local to this project.
    $localJdk = Get-ChildItem -LiteralPath "$projectRoot\.android-tools\jdk" -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path -LiteralPath "$($_.FullName)\bin\javac.exe" } | Select-Object -First 1
    if ($localJdk) { $env:JAVA_HOME = $localJdk.FullName }
    if (-not $env:JAVA_HOME) { throw 'Set JAVA_HOME to JDK 21 or install it in .android-tools/jdk.' }
    $localSdk = "$projectRoot\.android-tools\sdk"
    if (Test-Path -LiteralPath "$localSdk\platform-tools\adb.exe") { $env:ANDROID_HOME = $localSdk }
    if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT }
    if (-not $env:ANDROID_HOME) { throw 'Set ANDROID_HOME to an Android SDK with platform 36 and build-tools 35.0.0.' }
    $env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
    $env:GRADLE_USER_HOME = "$projectRoot\.android-tools\gradle-cache"
    $sdkPath = $env:ANDROID_HOME.Replace('\', '/')
    Set-Content -LiteralPath android\local.properties -Value "sdk.dir=$sdkPath" -Encoding ascii

    $signingDir = "$projectRoot\.android-signing"
    $signingFile = "$signingDir\keystore.properties"
    if (-not (Test-Path -LiteralPath $signingFile)) {
        if (Test-Path -LiteralPath "$signingDir\idea-sea-release.jks") {
            throw 'Existing signing key found without its properties. Restore keystore.properties; do not replace the key.'
        }
        New-Item -ItemType Directory -Force -Path $signingDir | Out-Null
        $secretBytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($secretBytes)
        $rng.Dispose()
        $signingSecret = [Convert]::ToBase64String($secretBytes)
        $env:IDEA_SEA_KEY_PASSWORD = $signingSecret
        try {
            & "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -keystore "$signingDir\idea-sea-release.jks" `
                -storetype JKS -storepass:env IDEA_SEA_KEY_PASSWORD -keypass:env IDEA_SEA_KEY_PASSWORD `
                -alias idea-sea -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Idea Sea, OU=Personal App' -noprompt
            if ($LASTEXITCODE -ne 0) { throw 'Signing key creation failed.' }
            @("storeFile=idea-sea-release.jks", "storePassword=$signingSecret", 'keyAlias=idea-sea', "keyPassword=$signingSecret") |
                Set-Content -LiteralPath $signingFile -Encoding ascii
        } finally {
            Remove-Item Env:IDEA_SEA_KEY_PASSWORD -ErrorAction SilentlyContinue
        }
    }

    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
    & npx.cmd cap sync android
    if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
    & .\android\gradlew.bat -p android "assemble$Configuration" --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }

    $variant = $Configuration.ToLowerInvariant()
    $version = (Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
    $artifactDir = "$projectRoot\artifacts\android"
    New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
    $apk = "$artifactDir\idea-sea-$version-$variant.apk"
    Copy-Item -LiteralPath "android\app\build\outputs\apk\$variant\app-$variant.apk" -Destination $apk
    $hashAlgorithm = [System.Security.Cryptography.SHA256]::Create()
    $apkStream = [IO.File]::OpenRead($apk)
    try {
        $checksum = [BitConverter]::ToString($hashAlgorithm.ComputeHash($apkStream)).Replace('-', '').ToLowerInvariant()
    } finally {
        $apkStream.Dispose()
        $hashAlgorithm.Dispose()
    }
    Set-Content -LiteralPath "$apk.sha256" -Value "$checksum  $([IO.Path]::GetFileName($apk))" -Encoding ascii
    Write-Output "APK: $apk"

    if ($Install) {
        $adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
        $deviceArgs = @()
        if ($Serial) { $deviceArgs = @('-s', $Serial) }
        & $adb @deviceArgs install -r $apk
        if ($LASTEXITCODE -ne 0) { throw 'Install failed. Unlock the phone and check its USB installation prompt.' }
        & $adb @deviceArgs shell am start -n com.ideasea.app/.MainActivity
        if ($LASTEXITCODE -ne 0) { throw 'App launch failed.' }
    }
} finally {
    Pop-Location
}
