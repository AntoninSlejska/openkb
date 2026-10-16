import { defineEventHandler } from 'h3'
import { drupalPassthrough } from '../../../../utils/drupal-proxy'

// Media-library dialog passthrough for the dialog's Grid display link, which
// core's media_library JS follows with Drupal.ajax; the path is the
// media_library view's own.
export default defineEventHandler(event => drupalPassthrough(event, 'admin/content/media-widget'))
