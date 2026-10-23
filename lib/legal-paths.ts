/** Public document readers, including an unknown dated revision's 404 page. */
export function isPublicLegalPath(pathname: string) {
  return /^\/(terms|privacy)(?:\/[^/]+)?\/?$/.test(pathname);
}
