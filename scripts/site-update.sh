#!/usr/bin/env bash
#
# Site update for openkb. Invoked by `openkb-update` and by `phapp update`.
#
#  - database updates and deploy hooks,
#  - config import, when the sync directory holds an export,
#  - cache rebuild,
#  - the install marker the cron service reads.
#
# Idempotent: a second run finds nothing to do.
set -e
cd "$(dirname "$0")/.."

DRUSH="php -d memory_limit=512M ./vendor/drush/drush/drush.php --uri=${DRUPAL_BASE_URL:-http://localhost}"

# Self-heals a site whose install stopped before the keys existed.
./scripts/ensure-oauth-keys.sh

$DRUSH updatedb -y
$DRUSH deploy:hook -y
if ls config/sync/*.yml >/dev/null 2>&1; then
  $DRUSH config:import -y
fi

# Ensure gemini_provider is enabled and configured if the module code is present.
if $DRUSH pm:list --status=installed 2>/dev/null | grep -q gemini_provider; then
  : # already enabled
elif [ -d "web/modules/contrib/gemini_provider" ] || [ -f "vendor/drupal/gemini_provider/gemini_provider.info.yml" ]; then
  echo "Enabling gemini_provider..."
  $DRUSH en gemini_provider -y 2>/dev/null || true
fi

$DRUSH php:eval '
  if (\Drupal::moduleHandler()->moduleExists("gemini_provider")) {
    if (!\Drupal::service("key.repository")->getKey("gemini_env")) {
      foreach (["/app/recipes/install-state/config/key.key.gemini_env.yml", "recipes/install-state/config/key.key.gemini_env.yml"] as $file) {
        if (file_exists($file)) {
          $values = \Symfony\Component\Yaml\Yaml::parseFile($file);
          \Drupal::entityTypeManager()->getStorage("key")->create($values)->save();
          break;
        }
      }
    }
    \Drupal::configFactory()->getEditable("gemini_provider.settings")->set("api_key", "gemini_env")->save();
  }
' 2>/dev/null || true

# Ensure ai_provider_ollama is enabled and configured if OPENKB_AI_PROVIDER=ollama or OLLAMA_HOST is set.
if [ "${OPENKB_AI_PROVIDER:-}" = "ollama" ] || [ -n "${OLLAMA_HOST:-}" ]; then
  if ! $DRUSH pm:list --status=installed 2>/dev/null | grep -q ai_provider_ollama; then
    echo "Enabling ai_provider_ollama..."
    $DRUSH en ai_provider_ollama -y 2>/dev/null || true
  fi
  $DRUSH config:set ai_provider_ollama.settings host_name "${OLLAMA_HOST:-http://host.docker.internal}" -y
  $DRUSH config:set ai_provider_ollama.settings port "${OLLAMA_PORT:-11434}" -y
  $DRUSH config:set ai.settings default_providers.chat.provider_id ollama -y
  $DRUSH config:set ai.settings default_providers.chat.model_id "${OLLAMA_CHAT_MODEL:-qwen2_5_32b}" -y
  $DRUSH config:set ai.settings default_providers.embeddings.provider_id ollama -y
  $DRUSH config:set ai.settings default_providers.embeddings.model_id "${OLLAMA_EMBED_MODEL:-nomic_embed_text_latest}" -y
  $DRUSH config:set search_api.server.ai_chunks backend_config.embeddings_engine "ollama__${OLLAMA_EMBED_MODEL:-nomic_embed_text_latest}" -y
  $DRUSH config:set search_api.server.ai_chunks backend_config.embeddings_engine_configuration.dimensions 768 -y
elif [ -n "${GEMINI_API_KEY:-}" ] && [ -z "${OPENAI_API_KEY:-}" ]; then
  $DRUSH config:set ai.settings default_providers.chat.provider_id gemini -y
  $DRUSH config:set ai.settings default_providers.chat.model_id models/gemini-3.8-flash -y
  $DRUSH config:set ai.settings default_providers.embeddings.provider_id gemini -y
  $DRUSH config:set ai.settings default_providers.embeddings.model_id models/gemini-embedding-001 -y
  $DRUSH config:set search_api.server.ai_chunks backend_config.embeddings_engine gemini__models/gemini-embedding-001 -y
  $DRUSH config:set search_api.server.ai_chunks backend_config.embeddings_engine_configuration.dimensions 3072 -y
fi

$DRUSH cache:rebuild

# Reaching this point means the site bootstrapped and its updates ran, so the
# marker the cron service reads belongs there.
touch "${PERSISTENT_FILES_DIR:-files}/.openkb-installed"
