/** Temporary password that satisfies typical strength rules (upper, lower, digit, symbol). */
export function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  const pick = (charset: string) => charset[Math.floor(Math.random() * charset.length)];

  const parts = [
    pick(upper), pick(upper), pick(upper),
    pick(lower), pick(lower), pick(lower),
    pick(digits), pick(digits), pick(digits),
    pick(symbols),
    pick(all), pick(all),
  ];

  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }
  return parts.join('');
}
