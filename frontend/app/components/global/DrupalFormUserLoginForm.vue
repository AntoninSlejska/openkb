<script setup lang="ts">
/**
 * Drupal's login form, on a sign-in card.
 *
 * Drupal renders the fields and the button into the default slot and checks
 * the credentials, so its own messages — a wrong password, a flood block (the
 * `user-form-flood-error` patch) — arrive with the re-rendered form. Also serves the password reset form.
 */
defineProps<{
  /** Drupal's own form attributes. */
  attributes?: Record<string, unknown>
  method?: string
}>()

const { title, messages } = useKbCePage()
const route = useRoute()

const isReset = route.path === '/user/password'

// - Login: without a destination, Drupal sends a signed-in user to their account page.
// - Reset: the login card shows Drupal's confirmation; other pages' renders consume it unseen.
const action = isReset
  ? `${route.path}?destination=/user/login`
  : route.query.destination ? route.fullPath : `${route.path}?destination=/`

const other = isReset
  ? { to: '/user/login', label: 'Back to log in' }
  : { to: '/user/password', label: 'Forgot your password?' }

useHead({ title })
</script>

<template>
  <main class="flex min-h-svh items-center justify-center bg-(--okb-ground) px-6 py-10">
    <div class="w-full max-w-md rounded-(--okb-radius) bg-default p-8 shadow-[0_0_0_1px_var(--ui-border)]">
      <ChromeLogo class="mb-5" />
      <h1 class="mb-5 text-[20px] font-bold tracking-tight text-highlighted">
        {{ title }}
      </h1>
      <DrupalCeMessages :messages="messages" class="mb-4" />
      <form
        v-bind="attributes ?? {}"
        :method="method ?? 'post'"
        :action="action"
        class="drupal-form okb-sign-in"
      >
        <slot />
      </form>
      <ULink :to="other.to" class="okb-other mt-5 inline-block text-[13px] text-toned underline hover:text-highlighted">
        {{ other.label }}
      </ULink>
    </div>
  </main>
</template>

<style scoped>
.okb-sign-in :deep(input:is([type='text'], [type='password'], [type='email'])) {
  max-width: none;
}

.okb-sign-in :deep(p) {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--ui-text-toned);
}

/* A wrong password or an account flood block (`user-form-flood-error` patch)
   carries Drupal's own reset link; the card's link would repeat it. */
.okb-sign-in:has(a[href^='/user/password']) + .okb-other {
  display: none;
}

/* The card's one action. */
.okb-sign-in :deep(.form-actions :is(input[type='submit'], button)) {
  width: 100%;
  border-color: var(--ui-primary);
  background: var(--ui-primary);
  color: var(--ui-text-inverted);
}

.okb-sign-in :deep(.form-actions :is(input[type='submit'], button):hover) {
  background: var(--okb-primary-hover);
}
</style>
