Set-Location $PSScriptRoot

$need = @(
  "index.html","pages/interview.html","pages/report.html","pages/settings.html",
  "assets/img/favicon.svg",
  "assets/css/tokens.css","assets/css/base.css","assets/css/components.css",
  "assets/css/pages/home.css","assets/css/pages/interview.css",
  "assets/css/pages/report.css","assets/css/pages/settings.css",
  "assets/js/core/config.js","assets/js/core/brand.js","assets/js/core/store.js",
  "assets/js/core/api.js","assets/js/core/mock.js","assets/js/core/shell.js",
  "assets/js/pages/home.js","assets/js/pages/interview.js",
  "assets/js/pages/report.js","assets/js/pages/settings.js"
)

foreach ($f in $need) {
  if (Test-Path $f) { "OK       $f" } else { "HILANG   $f" }
}