import { defineEventHandler } from 'h3'
import { drupalPassthrough } from '../utils/drupal-proxy'

// Media-library dialog passthrough.
export default defineEventHandler(event => drupalPassthrough(event, 'media-library'))
