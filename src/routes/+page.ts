import { redirect } from '@sveltejs/kit'
import { speciesIds } from '$lib/species/registry'

// The pilot has a single species — land straight on its validation map.
export const load = () => {
  redirect(307, `/${speciesIds[0] ?? 'perch'}`)
}
