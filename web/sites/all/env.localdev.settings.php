<?php

/**
 * @file
 * Local environment overrides: a laptop or a claude-vm Lima VM.
 *
 * Active when PHAPP_ENV=localdev or PHAPP_ENV=claude-vm.
 */

$settings['file_chmod_directory'] = octdec(2770);

// Trust the local hosts. Backend + decoupled frontend (Nuxt SSR proxy); a VM
// is reached on a forwarded port or its lima.internal name.
$settings['trusted_host_patterns'][] = '^.+\.localdev\.space$';
$settings['trusted_host_patterns'][] = '^.+\.lima\.internal$';
$settings['trusted_host_patterns'][] = '^localhost(:\d+)?$';
$settings['trusted_host_patterns'][] = '^127\.0\.0\.1(:\d+)?$';
