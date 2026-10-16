import { defineEventHandler } from 'h3'
import { drupalPassthrough } from '../../utils/drupal-proxy'

// Media-library dialog passthrough, static assets only.
export default defineEventHandler(event => drupalPassthrough(event, 'files', { assets: true }))
