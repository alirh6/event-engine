/** Canonical shapes for externally supplied identifiers and event names. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `order.created`, `invoice.paid_v2`, `user-account.deactivated` … */
export const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

/** `order`, `user-account`, `shipment3` … */
export const AGGREGATE_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
