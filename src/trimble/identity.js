export function extractTrimbleEmail(profile) {
  const candidates = [
    profile,
    profile?.user,
    profile?.data,
    profile?.data?.user,
    profile?.result,
    profile?.result?.user
  ];

  for (const candidate of candidates) {
    const email = candidate?.email;
    if (typeof email === 'string' && email.trim()) return email.trim();
  }

  return undefined;
}
