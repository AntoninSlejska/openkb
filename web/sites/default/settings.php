<?php

/**
 * @file
 * Per-site settings.php file.
 *
 * Sources the layered settings hierarchy under ../all/ based on the
 * PHAPP_ENV / PHAPP_ENV_TYPE / PHAPP_ENV_MODE environment vars.
 */

$env = getenv('PHAPP_ENV');
$env_type = getenv('PHAPP_ENV_TYPE') ?: 'docker';
$env_mode = getenv('PHAPP_ENV_MODE') ?: 'production';

// Site-specific prefix variable usable during configuration.
$site = basename(realpath(__DIR__));

// Shared base settings.
require __DIR__ . '/../all/base.settings.php';

// Per env-type (e.g. docker) settings, if present.
if ($env_type && file_exists(__DIR__ . '/../all/base-' . $env_type . '.settings.php')) {
  require __DIR__ . '/../all/base-' . $env_type . '.settings.php';
}
// Per env (localdev, dev, stage, live) settings, if present. A claude-vm is
// a localdev setup.
$env_settings = $env === 'claude-vm' ? 'localdev' : $env;
if ($env_settings && file_exists(__DIR__ . '/../all/env.' . $env_settings . '.settings.php')) {
  require __DIR__ . '/../all/env.' . $env_settings . '.settings.php';
}
// Per env-mode (development or production) overrides, if present.
if ($env_mode && file_exists(__DIR__ . '/../all/' . $env_mode . '.settings.php')) {
  require __DIR__ . '/../all/' . $env_mode . '.settings.php';
}

// Load local override settings if present (gitignored, see
// settings.local.php.example).
if (file_exists(__DIR__ . '/settings.local.php')) {
  include __DIR__ . '/settings.local.php';
}
