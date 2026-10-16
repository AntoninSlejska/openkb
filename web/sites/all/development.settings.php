<?php

/**
 * @file
 * Settings overrides for development environments.
 *
 * Active when PHAPP_ENV_MODE=development.
 */

// Show errors verbatim.
$config['system.logging']['error_level'] = 'verbose';

// Disable render + dynamic page caches, route discovery debug.
$settings['cache']['bins']['discovery_migration'] = 'cache.backend.memory';

// Find modules under `tests/modules`. The dev and CI recipes install two:
// - `vercel_ai_sdk_mock` (the chat with no API key)
// - `openkb_search_test` (`openkb_hash`, the chunk index with no API key)
$settings['extension_discovery_scan_tests'] = TRUE;

// Allow non-hardened permissions on writable dirs during local dev.
$settings['skip_permissions_hardening'] = TRUE;

// Pull in Drupal core's development services overlay (twig debug, null cache
// backend) if present. Path is relative to the docroot.
$dev_services = DRUPAL_ROOT . '/sites/development.services.yml';
if (file_exists($dev_services)) {
  $settings['container_yamls'][] = $dev_services;
}
