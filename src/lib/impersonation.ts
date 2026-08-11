// Shared between the admin action that starts impersonation and the
// dashboard action that ends it -- kept out of either 'use server' actions
// file since those may only export async functions.
export const IMPERSONATION_COOKIE = 'impersonation_token'
