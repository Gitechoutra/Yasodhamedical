/**
 * What each role may *do*, as opposed to what it may see.
 *
 * Read access is broad and stays that way — an administrator monitors the
 * whole hospital. These are the two operational workflows that belong to
 * exactly one role each, and the rule is separation rather than seniority:
 *
 *   * raising an OP is front-desk work    -> receptionist
 *   * running a consultation is clinical  -> doctor
 *
 * Admin is deliberately in neither. It is a monitoring and administration
 * role: it can watch a consultation's status and read the queue, but it does
 * not call patients in and does not see them.
 *
 * These helpers only decide what to *render*. The server enforces the same
 * rules independently (see `appointment_routes.create_appointment` and the
 * `get_current_doctor` / `_is_owning_doctor` guards in the consultation
 * routes), so a hand-crafted request from a signed-in admin is refused
 * whatever the UI happens to be showing. Hiding a control the API would 403
 * is a courtesy, never the boundary.
 */

/** Raising an outpatient visit and managing the queue. Front desk only. */
export function canCreateOp(role) {
  return role === "receptionist";
}

/**
 * Starting, resuming, continuing or ending a consultation.
 *
 * Doctors only, and the server narrows it further to the doctor the
 * consultation actually belongs to — this just decides whether the button is
 * worth drawing at all.
 */
export function canRunConsultation(role) {
  return role === "doctor";
}
